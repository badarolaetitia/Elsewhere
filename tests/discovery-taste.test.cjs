const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const venues=require('../src/data/nyc-pilot-venues.json').venues;
const via=venues.find(v=>v.name==='Via Carota'),palma=venues.find(v=>v.name==='Palma'),artusi=venues.find(v=>v.name==="L'ARTUSI");
const plain=v=>JSON.parse(JSON.stringify(v));
function setup(responder){const modules=new Map(),storage=new Map(),calls=[];
 function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);if(file.endsWith('.json'))return {__esModule:true,default:JSON.parse(fs.readFileSync(file,'utf8'))};const exports={};modules.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>{const f=path.resolve(path.dirname(file),id);return load(path.extname(f)?f:f+'.ts');},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},Request,Response,AbortSignal,URL,Date,console,fetch:async(url,options)=>{calls.push({url,options});if(!responder)throw Error('Offline');return responder(url,options);}});return exports;
 }
 return {load,calls};
}
const save=(v,interests=(v.features??[]).map(f=>f.label))=>({id:v.id,name:v.name,address:v.address,interests});
const visit=(v,fields={})=>({id:v.id,name:v.name,address:v.address,rating:5,liked:[],disliked:[],note:'private note: never send this to a provider',...fields});
const settings={enabled:true,choices:{}};
test('saves are weak signals; explicit likes outweigh accumulated saves and remain source-backed',()=>{
 const h=setup(),{buildDiscoveryProfile}=h.load('src/lib/discovery-profile.ts');
 const saved=venues.filter(v=>v.features?.some(f=>f.label==='Pasta')).slice(0,8).map(v=>save(v,['Pasta']));
 const weak=buildDiscoveryProfile(saved,[],settings).signals.find(s=>s.feature==='Pasta');assert.equal(weak.score,3);
 const strong=buildDiscoveryProfile([], [visit(via,{liked:['Handmade pasta']})],settings).signals.find(s=>s.feature==='Pasta');assert.equal(strong.score,6);assert.equal(strong.source,'like');
 const unsupported=buildDiscoveryProfile([save(via,['Frozen yogurt'])],[visit(via,{liked:['Frozen yogurt']})],settings);assert.ok(!unsupported.signals.some(s=>s.feature==='Frozen yogurt'));
 assert.equal(buildDiscoveryProfile([save(venues.find(v=>!v.features))],[],settings).signals.length,0);
});
test('dislikes beat weak saved interests, duplicate records do not inflate a profile, and deletion removes signals',()=>{
 const {load}=setup(),{buildDiscoveryProfile}=load('src/lib/discovery-profile.ts');
 const p=buildDiscoveryProfile([save(artusi,['Pasta']),save(palma,['Pasta'])],[visit(via,{rating:1,disliked:['Pasta']}),visit(via,{rating:1,disliked:['Pasta']})],settings);
 assert.equal(p.signals.find(s=>s.feature==='Pasta').score,-6);
 const duplicate=buildDiscoveryProfile([save(via,['Pasta']),save(via,['Pasta'])],[],settings);assert.equal(duplicate.signals[0].score,1);assert.equal(duplicate.usedSaves,1);
 assert.equal(buildDiscoveryProfile([],[],settings).signals.length,0);
});
test('profile corrections override learning, ignore suppresses a trait, and opt-out sends no signals',()=>{
 const {buildDiscoveryProfile}=setup().load('src/lib/discovery-profile.ts');
 for(const [choice,score] of [['prefer',12],['avoid',-12],['ignore',0]]){
  const p=buildDiscoveryProfile([save(via,['Pasta'])],[],{enabled:true,choices:{Pasta:choice}});assert.equal(p.traits.find(t=>t.feature==='Pasta').score,score);assert.equal(p.signals.length,score===0?0:1);
 }
 const disabled=buildDiscoveryProfile([save(via)],[],{enabled:false,choices:{Pasta:'prefer'}});assert.ok(disabled.traits.length);assert.equal(disabled.signals.length,0);
 const manual=buildDiscoveryProfile([],[],{enabled:true,choices:{Wine:'prefer'}});assert.equal(manual.signals[0].source,'manual');
});
test('settings sync through an existing private saved record without appearing as a place or getting removed by saves',()=>{
 const {load}=setup(),store=load('src/lib/local-data.ts'),taste=load('src/lib/taste-profile.ts');store.setDataOwner('alice');
 taste.writeTasteSettings({enabled:true,choices:{Pasta:'avoid'}});taste.toggleSavedPlace(save(via));assert.equal(taste.readSavedPlaces().length,1);assert.equal(taste.readTasteSettings().choices.Pasta,'avoid');
 taste.removeSavedPlace(via.id);assert.equal(taste.readSavedPlaces().length,0);assert.equal(taste.readTasteSettings().choices.Pasta,'avoid');
 const pending=store.readPending().find(p=>p.id===taste.TASTE_SETTINGS_ID);assert.equal(pending.kind,'saved');assert.equal(pending.data.recordType,'taste-settings');
 store.setDataOwner('bob');assert.equal(Object.keys(taste.readTasteSettings().choices).length,0);taste.writeTasteSettings({enabled:false,choices:{Wine:'prefer'}});
 store.setDataOwner('alice');assert.equal(taste.readTasteSettings().choices.Pasta,'avoid');
 const sent=store.readPending();store.acknowledgePending(sent,'alice');store.applyCloud('saved',[pending.data],'alice');assert.equal(taste.readTasteSettings().choices.Pasta,'avoid');assert.equal(taste.readSavedPlaces().length,0);
});
test('Discovery taste tool validates profile signals and never promotes unsupported candidate offerings',()=>{
 const {load}=setup(),{applyTasteProfile}=load('src/lib/discovery-taste.ts');
 const input=[{experienceEvidence:{Pasta:{status:'SUPPORTED',summary:'Pasta',sources:[{url:'https://example.com'}]}}},{experienceEvidence:{Pasta:{status:'UNKNOWN',summary:'Guess',sources:[]}}}];
 const result=applyTasteProfile(input,[{feature:'Pasta',score:6,source:'like',evidenceCount:1},{feature:'Frozen yogurt',score:12,source:'manual'}]);
 assert.equal(result[0].personalizationTieBreak,6);assert.match(result[0].personalizationReason,/explicit visit likes/);assert.equal(result[1].personalizationTieBreak,0);assert.equal(result[1].personalizationReason,'');
});
test('end-to-end personalization reranks ties, preserves stronger fit, required offerings and distance, and needs no model call',async()=>{
 const h=setup(),{POST}=h.load('src/app/places+api.ts');const post=async body=>{const r=await POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify(body)}));assert.equal(r.status,200);return r.json();};
 const profile=[{feature:'Wine',score:-12,source:'manual',evidenceCount:1}];
 const data=await post({place:'Like Via Carota for pasta within 1 km',context:{tasteProfile:profile}});
 assert.equal(data.recommendations[0].name,'Palma');const tied=data.recommendations.filter(r=>r.similarityScore===73);assert.ok(tied[0].personalizationTieBreak>=0);assert.ok(tied.find(r=>r.name==="L'ARTUSI").personalizationTieBreak<0);
 assert.ok(data.recommendations.every(v=>v.experienceEvidence.Pasta.status==='SUPPORTED'&&v.distance<=1));assert.ok(data.discovery.steps.some(s=>s.step==='read_taste_profile'&&s.count===1));assert.equal(h.calls.length,0);
 const closest=await post({place:'Like Via Carota for pasta within 1 km',searchId:data.searchId,discoveryPlan:data.discoveryPlan,selectedKeywords:['Pasta'],distanceKm:1,preference:'closest',context:{tasteProfile:profile}});
 assert.ok(closest.recommendations.every((v,i,a)=>i===0||a[i-1].distance<=v.distance));assert.equal(h.calls.length,0);
});
test('private activity never enters Gemini input and a provider outage keeps personalized plain search working',async()=>{
 const h=setup((_url,options)=>{assert.ok(!options.body.includes('private note'));assert.ok(!options.body.includes('tasteProfile'));return Response.json({error:'quota'},{status:429});});
 const {POST}=h.load('src/app/places+api.ts');const r=await POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Like Via Carota for pasta',context:{tasteProfile:[{feature:'Pasta',score:6,source:'like',evidenceCount:1}],privateNotes:'private note'}})}),{GEMINI_API_KEY:'test'});
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.discovery.mode,'plain-search');assert.ok(data.recommendations.every(v=>v.personalizationTieBreak===6));assert.equal(h.calls.length,1);
});
