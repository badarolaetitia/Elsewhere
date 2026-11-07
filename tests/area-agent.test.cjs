const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const catalog=require('../src/data/nyc-pilot-venues.json');
const checked=catalog.venues.filter(v=>v.features?.length);
const NOW=Date.parse('2026-11-07T19:00:00Z');
function harness(fetcher){const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);if(file.endsWith('.json'))return {__esModule:true,default:JSON.parse(fs.readFileSync(file,'utf8'))};const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports,require:id=>{const f=path.resolve(path.dirname(file),id);return load(path.extname(f)?f:f+'.ts');},Date,Intl,URLSearchParams,URL,Request,Response,AbortSignal,fetch:fetcher??(()=>{throw Error('Unexpected network');})});return exports;}return {load};}
const plain=v=>JSON.parse(JSON.stringify(v));
const rows=Array.from({length:7*24},(_,i)=>({station_complex_id:'323',station_complex:'Christopher St (1)',latitude:'40.733422',longitude:'-74.002906',dow:String(Math.floor(i/24)),hour:String(i%24),riders:String((i%24+1)*40),samples:'4'}));
const station={id:'323',name:'Christopher St (1)',lat:40.733422,lng:-74.002906,typical:{'6-14':40,'6-19':100}};
const sources=[{kind:'transit',url:'https://data.ny.gov/transport',status:'available',fetchedAt:new Date(NOW).toISOString(),dataThrough:'2026-10-29T23:00:00',count:1},{kind:'events',url:'https://data.cityofnewyork.us/events',status:'available',fetchedAt:new Date(NOW).toISOString(),count:0}];
const signals=()=>({stations:[station],events:[],sources,expiresAt:NOW+900_000});
test('station tools average hourly entries across actual sample dates and reject insufficient records',()=>{
 const tools=harness().load('src/lib/crowd-agent-tools.ts');const result=tools.toStations([...rows,{...rows[0],station_complex_id:'bad',samples:'1'}]);assert.equal(result.length,1);assert.equal(result[0].typical['0-0'],10);assert.equal(result[0].typical['0-23'],240);
 assert.equal(tools.toStations(rows.slice(0,5)).length,0);
});
test('agent gathers independent real-source tools and labels historical coverage and geocoded events',async()=>{
 const tools=harness().load('src/lib/crowd-agent-tools.ts');const urls=[];
 const data=await tools.collectAreaSignals(NOW,async url=>{urls.push(url);const u=new URL(url);
  if(u.hostname==='data.ny.gov')return u.searchParams.get('$select').includes('max(')?[{latest:'2026-10-29T23:00:00.000'}]:rows;
  if(u.hostname==='data.cityofnewyork.us')return [{event_id:'fixture',event_name:'Fixture event',community_board:'2,',start_date_time:'2026-11-07T12:00:00.000',end_date_time:'2026-11-07T16:00:00.000',event_location:'Abingdon Square'}];
  return {features:[{geometry:{coordinates:[-74.00543,40.73734]},properties:{borough:'Manhattan',layer:'venue',confidence:0.8}}]};
 });
 assert.equal(data.stations.length,1);assert.equal(data.events.length,1);assert.equal(data.events[0].approximate,true);assert.equal(data.sources[0].dataThrough,'2026-10-29T23:00:00.000');assert.equal(urls.length,4);
 const query=new URL(urls.find(url=>url.includes('samples')));assert.match(query.searchParams.get('$select'),/count\(distinct transit_timestamp\)/);assert.match(query.searchParams.get('$where'),/within_circle/);
});
test('source outages and unresolved event locations never become quiet estimates',async()=>{
 const h=harness(),tools=h.load('src/lib/crowd-agent-tools.ts'),area=h.load('src/lib/area-crowd.ts');
 const data=await tools.collectAreaSignals(NOW,async()=>{throw Error('offline');});
 assert.ok(data.sources.every(s=>s.status==='unavailable'));assert.equal(area.areaAt(data,station,'2026-11-07T14:00:00',NOW).label,'insufficient');
 const eventOnly=await tools.collectAreaSignals(NOW,async url=>url.includes('cityofnewyork')?[{event_id:'x',event_name:'Not located',community_board:'2,',start_date_time:'2026-11-07T12:00:00',end_date_time:'2026-11-07T16:00:00',event_location:'Somewhere'}]:{features:[]});
 assert.equal(eventOnly.events.length,0);assert.equal(eventOnly.sources[1].unlocated,1);
});
test('area evidence uses New York time, expires and never paints uncovered areas calm',()=>{
 const area=harness().load('src/lib/area-crowd.ts');assert.equal(area.newYorkLocal(Date.parse('2026-11-07T01:00:00Z')),'2026-11-06T20:00:00');
 assert.equal(area.stationLoad(station,'2026-11-07T14:00:00'),0.4);
 assert.equal(area.areaAt(signals(),station,'2026-11-07T14:00:00',NOW).label,'typical');
 assert.equal(area.areaAt(signals(),station,'2026-11-07T14:00:00',NOW+900_000).label,'insufficient');
 assert.equal(area.areaAt(signals(),{lat:40.7408,lng:-74.011},'2026-11-07T14:00:00',NOW).label,'insufficient');
 const noTransit={...signals(),stations:[],events:[]};assert.equal(area.heatGrid(noTransit,'2026-11-07T14:00:00',NOW).length,0);
});
test('discovery hands only checked IDs to Crowd and returns source-linked assessments, never restaurant occupancy',()=>{
 const {load}=harness(),agent=load('src/lib/area-crowd-agent.ts');const ids=catalog.venues.map(v=>v.id);const result=agent.investigateArea(ids,signals(),'2026-11-07T14:00:00',NOW);
 assert.equal(result.venues.length,checked.length);assert.ok(result.activity.some(m=>m.agent==='Discovery'));assert.ok(result.activity.some(m=>m.agent==='Crowd'));assert.ok(result.activity.some(m=>m.agent==='Coordinator'));
 assert.ok(result.venues.every(v=>!('crowd' in v)));assert.ok(result.venues.filter(v=>v.reading.value!==null).every(v=>v.reading.sources.length&&v.reading.confidence==='low'));
 assert.throws(()=>agent.requestedLocalTime('2026-02-31T12:00:00',NOW));assert.throws(()=>agent.requestedLocalTime('2027-01-01T12:00:00',NOW));
});
test('Coordinator uses area research only within comparable fit and leaves missing evidence or closest sort untouched',()=>{
 const {load}=harness(),{coordinateArea}=load('src/lib/crowd-agent.ts');const input=[0,1,2].map(i=>({placeId:checked[i].id,elsewhereScore:90,focusMatchScore:100,crowdPriorityKey:'same'}));
 const investigation={venues:[{id:checked[0].id,reading:{value:0.9}},{id:checked[2].id,reading:{value:0.2}}],expiresAt:NOW+900_000};
 assert.deepEqual(plain(coordinateArea(input,investigation,{preferQuiet:true,now:NOW}).map(v=>v.placeId)),[checked[2].id,checked[1].id,checked[0].id]);
 for(const options of [{preferQuiet:false},{preferQuiet:true,closest:true},{preferQuiet:true,now:NOW+900_000}])assert.deepEqual(plain(coordinateArea(input,investigation,{now:NOW,...options})),input);
 const stronger=[{...input[0],elsewhereScore:99},input[2]];assert.deepEqual(plain(coordinateArea(stronger,investigation,{preferQuiet:true,now:NOW})),stronger);
});
test('map uses true Mercator positions and a bounded visible tile grid',()=>{
 const {mapViewport}=harness().load('src/lib/map-projection.ts');const center={lat:40.73475,lng:-74.00425},view=mapViewport(600,420,15,center),p=view.position(center.lat,center.lng);assert.equal(p.left,300);assert.equal(p.top,210);assert.ok(view.tiles.length<=16);assert.ok(view.position(center.lat+0.001,center.lng).top<210);
});
test('Crowd endpoint rejects unchecked IDs, oversized bodies and unsupported dates before source requests',async()=>{
 const {load}=harness(),{POST}=load('src/app/crowd+api.ts');
 const request=body=>new Request('http://localhost/crowd',{method:'POST',body:JSON.stringify(body)});
 const withheld=catalog.venues.find(v=>!v.features?.length);
 assert.equal((await POST(request({venueIds:[withheld.id]}))).status,400);
 const dated=await POST(request({venueIds:[checked[0].id],atLocal:'2020-01-01T12:00:00'}));assert.equal(dated.status,400);assert.match((await dated.json()).error,/next seven days/);
 assert.equal((await POST(request({venueIds:[],extra:'x'.repeat(10001)}))).status,413);
});
