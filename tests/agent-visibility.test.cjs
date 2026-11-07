const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const catalog=require('../src/data/nyc-pilot-venues.json'),checked=catalog.venues.filter(v=>v.features?.length);
function harness(){const cache=new Map();const jsx=(type,props,key)=>({type,props,key});function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);if(file.endsWith('.json'))return {__esModule:true,default:JSON.parse(fs.readFileSync(file,'utf8'))};const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,require:id=>{if(id==='react')return {useState:value=>[typeof value==='function'?value():value,()=>{}]};if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};if(id==='react-native')return {View:'View',Text:'Text',Image:'Image',Pressable:'Pressable',ActivityIndicator:'Spinner',Linking:{openURL:()=>{}}};const f=path.resolve(path.dirname(file),id);return load(path.extname(f)?f:f+'.ts');},Date,Intl});return exports;}return load;}
const input={loading:false,error:'',needsClarification:false,resultCount:2,discoverySummary:'Two alternatives',tasteSignals:0,areaLoading:true,areaError:'',investigation:null,preferQuiet:false,closest:false};
test('agent statuses remain visible and truthful during discovery, crowd research and source failure',()=>{
 const progress=harness()('src/lib/agent-progress.ts').agentProgress;
 let steps=progress({...input,loading:true,resultCount:0});assert.equal(steps[0].status,'Working');assert.equal(steps[1].status,'Waiting');
 steps=progress(input);assert.equal(steps[0].status,'Complete');assert.equal(steps[1].status,'Working');assert.equal(steps[2].status,'Complete');
 steps=progress({...input,preferQuiet:true});assert.equal(steps[2].status,'Working');
 steps=progress({...input,areaLoading:false,areaError:'timeout',preferQuiet:true});assert.equal(steps[1].status,'Unavailable');assert.match(steps[1].detail,/pins remain visible/);assert.match(steps[2].detail,/experience-first/);
 steps=progress({...input,loading:false,error:'unsupported',needsClarification:true,resultCount:0});assert.equal(steps[0].status,'Needs detail');assert.equal(steps[1].status,'Waiting');
});
test('unassessed map has only checked real coordinates, neutral pins and no invented research log or shading',()=>{
 const load=harness(),{unassessedMap}=load('src/lib/area-crowd-agent.ts');
 const map=unassessedMap([checked[0].id,catalog.venues.find(v=>!v.features?.length).id,'invented'],Date.parse('2026-11-07T19:00:00Z'));
 assert.equal(map.venues.length,1);assert.equal(map.venues[0].latitude,checked[0].latitude);assert.equal(map.venues[0].reading.label,'insufficient');assert.equal(map.venues[0].reading.value,null);assert.equal(map.heat.length,0);assert.equal(map.activity.length,0);assert.equal(map.sources.length,0);
});
test('map renders immediately in both loading and failed research states',()=>{
 const load=harness(),map=load('src/lib/area-crowd-agent.ts').unassessedMap(checked.slice(0,2).map(v=>v.id),Date.now());
 const Heatmap=load('src/components/area-heatmap.tsx').default;
 function nodes(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
 for(const researchState of ['loading','unavailable']){
  const tree=Heatmap({investigation:map,researchState,selectedId:null,onSelect:()=>{},onViewPlace:()=>{}}),all=nodes(tree);
  assert.ok(all.some(n=>n.props?.testID==='area-map'));
  assert.equal(all.filter(n=>n.props?.accessibilityLabel?.includes('no area estimate')).length,2);
  assert.ok(all.some(n=>n.type==='Text'&&n.props.children==='Neighbourhood heatmap'));
  assert.ok(!JSON.stringify(tree).includes('Estimated area activity ·'));
 }
});
test('agent activity is expanded by default instead of hidden behind research details',()=>{
 const load=harness(),progress=load('src/lib/agent-progress.ts').agentProgress(input),Activity=load('src/components/agent-activity.tsx').default;
 const tree=Activity({steps:progress}),text=JSON.stringify(tree);assert.match(text,/Discovery Agent/);assert.match(text,/Crowd Agent/);assert.match(text,/Coordinator/);assert.equal(tree.props.testID,'agent-activity');
});
