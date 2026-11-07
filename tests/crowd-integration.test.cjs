const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const catalog=require('../src/data/nyc-pilot-venues.json');
const checked=catalog.venues.filter(v=>v.features?.length);
const NOW=Date.parse('2026-11-07T19:00:00Z');
function setup(){
  const cache=new Map(),storage=new Map();
  function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);
    if(file.endsWith('.json'))return {__esModule:true,default:JSON.parse(fs.readFileSync(file,'utf8'))};
    const exports={};cache.set(file,exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    vm.runInNewContext(code,{exports,require:id=>{if(!id.startsWith('.'))throw Error(`Unexpected dependency: ${id}`);const f=path.resolve(path.dirname(file),id);return load(path.extname(f)?f:f+'.ts');},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},Date,Request,Response,AbortSignal,URL,console});
    return exports;
  }
  return {load,evidence:load('src/lib/crowd-evidence.ts'),agent:load('src/lib/crowd-agent.ts'),local:load('src/lib/local-data.ts')};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const candidate=(i,score=90,fields={})=>({placeId:checked[i].id,elsewhereScore:score,focusMatchScore:100,crowdPriorityKey:'same',...fields});
const report=(i,level='quiet',at=NOW,fields={})=>({id:`r-${i}`,venueKey:checked[i].id,level,at,source:'device',...fields});
test('crowd evidence accepts only checked real venues and rejects invalid or simulated observations',()=>{
  const h=setup(),withheld=catalog.venues.find(v=>!v.features?.length);
  assert.throws(()=>h.evidence.addCrowdReport({venueKey:withheld.id,level:'quiet'},NOW),/checked/);
  assert.throws(()=>h.evidence.addCrowdReport({venueKey:'made-up',level:'quiet'},NOW),/checked/);
  for(const waitMinutes of [-1,241,NaN,2.5])assert.throws(()=>h.evidence.addCrowdReport({venueKey:checked[0].id,level:'quiet',waitMinutes},NOW),/wait/);
  assert.equal(h.evidence.evaluateCrowd([report(0,'quiet',NOW,{source:'simulation'})],checked[0].id,NOW).label,'unknown');
  assert.equal(h.evidence.evaluateCrowd([report(0,'quiet',NOW+1)],checked[0].id,NOW).label,'unknown');
});
test('reports expire exactly at two hours and wait evidence belongs to the winning crowd level',()=>{
  const {evidence:e}=setup();const reports=[report(0,'quiet',NOW-60_000,{waitMinutes:0}),report(0,'busy',NOW-110*60_000,{waitMinutes:90})];
  const reading=e.evaluateCrowd(reports,checked[0].id,NOW);assert.equal(reading.label,'quiet');assert.equal(reading.waitMinutes,0);assert.match(e.describeReading(reading),/0 min wait/);
  assert.equal(e.evaluateCrowd([report(0)],checked[0].id,NOW+120*60_000-1).label,'quiet');
  assert.equal(e.evaluateCrowd([report(0)],checked[0].id,NOW+120*60_000).label,'unknown');
});
test('report corrections replace duplicates; accounts stay isolated and reports never enter cloud sync',()=>{
  const {evidence:e,local}=setup();local.setDataOwner('alice');
  e.addCrowdReport({venueKey:checked[0].id,level:'busy'},NOW);
  e.addCrowdReport({venueKey:checked[0].id,level:'quiet'},NOW+60_000);
  assert.equal(e.allCrowdReports().length,1);assert.equal(e.allCrowdReports()[0].level,'quiet');assert.equal(local.readPending().length,0);
  local.setDataOwner('bob');assert.equal(e.allCrowdReports().length,0);
  e.addCrowdReport({venueKey:checked[1].id,level:'moderate'},NOW);
  local.setDataOwner('alice');assert.equal(e.allCrowdReports()[0].venueKey,checked[0].id);
  local.clearAccountCache('alice');assert.equal(e.allCrowdReports().length,0);
  local.setDataOwner('bob');assert.equal(e.allCrowdReports().length,1);
});
test('unknown gets no bonus or penalty and known crowds reorder only similarly fitting reported slots',()=>{
  const {agent}=setup();const input=[candidate(0,92),candidate(1,91),candidate(2,90)],reports=[report(0,'busy'),report(2,'quiet')];
  const result=agent.coordinateCrowd(input,reports,{preferQuiet:true,now:NOW});
  assert.deepEqual(plain(result.recommendations.map(v=>v.placeId)),[checked[2].id,checked[1].id,checked[0].id]);
  assert.equal(result.recommendations[1],input[1]);assert.equal(result.recommendations[0].elsewhereScore,90);assert.equal(input[0].placeId,checked[0].id);
  for(const options of [{preferQuiet:false},{preferQuiet:true,closest:true}])assert.deepEqual(plain(agent.coordinateCrowd(input,reports,{...options,now:NOW}).recommendations),input);
  assert.deepEqual(plain(agent.coordinateCrowd(input,[],{preferQuiet:true,now:NOW}).recommendations),input);
});
test('crowds never override stronger fits, focus, optional preference priority or taste priority',()=>{
  const {agent}=setup(),reports=[report(0,'busy'),report(1,'quiet')];
  for(const second of [candidate(1,84),candidate(1,90,{focusMatchScore:95}),candidate(1,90,{crowdPriorityKey:'different'})]){
    const input=[candidate(0,90),second];assert.deepEqual(plain(agent.coordinateCrowd(input,reports,{preferQuiet:true,now:NOW}).recommendations),input);
  }
  const input=[candidate(0),candidate(1)];assert.deepEqual(plain(agent.coordinateCrowd(input,reports,{preferQuiet:true,now:NOW+120*60_000}).recommendations),input);
});
test('existing discovery API and crowd coordination share real IDs and source-backed menu evidence',async()=>{
  const h=setup(),{searchPilotDataset}=h.load('src/lib/dataset-search.ts');
  const response=await searchPilotDataset(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Like Via Carota for pasta within 1 km'})}));
  assert.equal(response.status,200);const data=await response.json();assert.ok(data.recommendations.length>5);
  const [a,b]=data.recommendations;h.evidence.addCrowdReport({venueKey:a.placeId,level:'busy'},NOW);h.evidence.addCrowdReport({venueKey:b.placeId,level:'quiet'},NOW);
  const result=h.agent.coordinateCrowd(data.recommendations,h.evidence.allCrowdReports(),{preferQuiet:true,now:NOW});
  assert.equal(result.activity.checked,2);
  for(const v of result.recommendations){assert.ok(checked.some(c=>c.id===v.placeId));assert.ok(v.distance<=1);assert.equal(v.experienceEvidence.Pasta.status,'SUPPORTED');assert.ok(v.experienceEvidence.Pasta.sources.length);assert.ok(v.crowdPriorityKey);}
});
test('mounted crowd readings schedule exact expiry and refresh on account, focus and tab changes',()=>{
  const h=setup();h.local.setDataOwner('alice');h.evidence.addCrowdReport({venueKey:checked[0].id,level:'busy'},NOW);
  let clock=NOW+120*60_000-100,snapshot;const effects=[],timers=[],events={};let focus,resume;
  class Clock extends Date{static now(){return clock;}}
  const imports={
    react:{useCallback:fn=>fn,useState:initial=>{snapshot=initial();return [snapshot,value=>{snapshot=value;}];},useEffect:fn=>effects.push(fn)},
    'expo-router':{useFocusEffect:fn=>{focus=fn;}},
    'react-native':{Platform:{OS:'web'},AppState:{addEventListener:(_event,fn)=>{resume=fn;return {remove(){}};}}},
    './crowd-evidence':h.evidence,'./local-data':h.local,
  };
  const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/use-crowd-evidence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:id=>imports[id],Date:Clock,setTimeout:(fn,delay)=>{timers.push({fn,delay});return 1;},clearTimeout:()=>{},window:{addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener:()=>{}}});
  exports.useCrowdEvidence();const cleanups=effects.map(fn=>fn());
  assert.equal(timers[0].delay,100);clock+=100;timers[0].fn();
  assert.equal(h.evidence.evaluateCrowd(snapshot.reports,checked[0].id,snapshot.now).label,'unknown');
  h.local.setDataOwner('bob');assert.equal(snapshot.reports.length,0);
  clock++;focus();assert.equal(snapshot.now,clock);
  clock++;resume('active');assert.equal(snapshot.now,clock);
  clock++;events.storage({key:h.local.crowdStorageKey()});assert.equal(snapshot.now,clock);
  for(const cleanup of cleanups)if(cleanup)cleanup();
});
