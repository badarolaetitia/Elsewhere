const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
function harness(responder){
 const cache=new Map();let calls=0;
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);
  if(file.endsWith('.json'))return {__esModule:true,default:JSON.parse(fs.readFileSync(file,'utf8'))};
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>{if(!id.startsWith('.'))throw Error('Unexpected dependency');let f=path.resolve(path.dirname(file),id);return load(path.extname(f)?f:f+'.ts');},Request,Response,AbortSignal,URL,Date,console,fetch:async(...args)=>{calls++;if(!responder)throw Error('Network unavailable');return responder(...args);}});return exports;
 }
 const {POST}=load('src/app/places+api.ts');
 return {agent:load('src/lib/discovery-agent.ts'),calls:()=>calls,post:async(body,env={})=>{const response=await POST(new Request('https://elsewhere.example/places',{method:'POST',body:JSON.stringify(body)}),env);return {status:response.status,data:await response.json()};}};
}
const via='nyc-dohmh:50008323';
const plan={venueId:via,requiredFeatures:['Pasta'],preferredFeatures:[],radiusKm:1,sort:'local',unsupported:[]};
const generated=value=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
test('plain fallback interprets a named reference, offering and radius with grounded results',async()=>{
 const h=harness();const {status,data}=await h.post({place:'Somewhere like Via Carota mainly for pasta within 1 km'});
 assert.equal(status,200);assert.equal(data.discovery.mode,'plain-search');assert.equal(data.distanceKm,1);
 assert.deepEqual(data.selectedKeywords,['Pasta']);assert.ok(data.recommendations.length>5);
 assert.ok(data.recommendations.every(v=>v.distance<=1&&v.experienceEvidence.Pasta.status==='SUPPORTED'));
 assert.equal(h.calls(),0);assert.ok(!JSON.stringify(data).includes('UNKNOWN'));
});
test('Gemini receives only the public catalogue and produces a validated plan, never venue facts',async()=>{
 const h=harness((url,options)=>{
  assert.ok(url.endsWith('gemini-2.5-flash:generateContent'));
  const body=JSON.parse(options.body);const input=JSON.parse(body.contents[0].parts[0].text);
  assert.ok(input.venues.every(v=>v.id&&v.name&&!v.features));assert.ok(!JSON.stringify(input).includes('private-saves'));
  assert.ok(!body.tools);return generated({...plan,radiusKm:5,sort:'closest',preferredFeatures:['Wine']});
 });
 const r=await h.post({place:'Somewhere like Via Carota mainly for pasta within 1 km'},{GEMINI_API_KEY:'test-only'});
 assert.equal(r.status,200);assert.equal(r.data.discovery.mode,'interpreted');assert.equal(r.data.distanceKm,1);assert.equal(r.data.preference,'local');assert.equal(h.calls(),1);
 const reranked=await h.post({place:'Somewhere like Via Carota mainly for pasta within 1 km',searchId:r.data.searchId,discoveryPlan:r.data.discoveryPlan,selectedKeywords:['Pasta'],distanceKm:2});
 assert.equal(reranked.status,200);assert.equal(reranked.data.distanceKm,2);assert.equal(h.calls(),1);
});
test('a hallucinated venue, feature or dropped explicit request falls back without invented evidence',async()=>{
 for(const bad of [{...plan,venueId:'made-up'},{...plan,requiredFeatures:['Frozen yogurt']},{...plan,requiredFeatures:[]}]){
  const h=harness(()=>generated(bad));const r=await h.post({place:'Like Via Carota for pasta within 1 km'},{GEMINI_API_KEY:'test-only'});
  assert.equal(r.status,200);assert.equal(r.data.discovery.mode,'plain-search');assert.ok(r.data.recommendations.every(v=>v.experienceEvidence.Pasta));
 }
});
test('unsupported vibes, exclusions, crowding and radii ask for clarification instead of being silently ignored',async()=>{
 for(const query of ['Like Via Carota but quieter','Like Via Carota for romantic vibes','Like Via Carota without seafood','Like Via Carota within 500 m']){
  const h=harness(()=>generated(plan));const r=await h.post({place:query},{GEMINI_API_KEY:'test-only'});
  assert.equal(r.status,422,query);assert.equal(r.data.needsClarification,true);assert.ok(!r.data.recommendations);
 }
});
test('provider failure leaves simple searches usable; ambiguous requests ask a question',async()=>{
 const h=harness(()=>Response.json({error:'quota'},{status:429}));
 assert.equal((await h.post({place:'Like Via Carota for pasta'},{GEMINI_API_KEY:'test-only'})).status,200);
 const ambiguous=await h.post({place:'Somewhere lovely'});assert.equal(ambiguous.status,422);assert.equal(ambiguous.data.needsClarification,true);
 const bare=await h.post({place:'Via Carota'});assert.equal(bare.status,200);assert.equal(bare.data.discovery.mode,'direct');
});
test('invalid resume plans and changed requests cannot trigger additional provider calls',async()=>{
 const h=harness();const initial=await h.post({place:'Via Carota'});
 const changed=await h.post({place:'Like Via Carota for pasta',searchId:initial.data.searchId,discoveryPlan:initial.data.discoveryPlan});
 assert.equal(changed.status,410);assert.equal(h.calls(),0);
 const forged=await h.post({place:'Via Carota',searchId:initial.data.searchId,discoveryPlan:{query:'Via Carota',intent:'',plan:{...plan,requiredFeatures:['Made-up food']}}});
 assert.equal(forged.status,410);assert.equal(h.calls(),0);
});
test('explicit priority order is preserved using only recorded reference features',()=>{
 const h=harness();const p=h.agent.plainDiscoveryPlan('Via Carota','Priority 1: Atmosphere; Priority 2: Food & products');
 assert.equal(p.preferredFeatures[0],'Terrace dining');assert.ok(p.preferredFeatures.includes('Pasta'));
});
