const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file);
 if(file.endsWith('.json'))return {__esModule:true,default:JSON.parse(fs.readFileSync(file,'utf8'))};
 const exports={};cache.set(file,exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports,require:id=>{if(!id.startsWith('.'))throw Error('Unexpected dependency: '+id);let target=path.resolve(path.dirname(file),id);if(!path.extname(target))target+='.ts';return load(target);},Request,Response,URL,Date,console});return exports;
}
const {POST}=load('src/app/places+api.ts');
const catalog=JSON.parse(fs.readFileSync('src/data/nyc-pilot-venues.json','utf8'));
async function post(body){const r=await POST(new Request('https://elsewhere.example/places',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}
test('public API searches only the full West Village intersection without provider or model dependencies',async()=>{
 const {status,data}=await post({place:'Magnolia Bakery'});assert.equal(status,200);
 assert.equal(data.researchStatus,'dataset');assert.equal(data.dataset.venues,96);
 assert.ok(data.recommendations.some(v=>v.name==='Molly’s Cupcakes'));
 assert.ok(data.recommendations.some(v=>v.name==='PASTICCERIA ROCCO'));
 assert.ok(!JSON.stringify(data).includes('sb_secret_'));
 assert.ok(data.recommendations.every(v=>v.placeId!==data.searchedPlace.placeId&&!('crowding' in v)));
 assert.ok(!JSON.stringify(data).includes('Filet Mignon'));
 assert.ok(!JSON.stringify(data).includes('UNKNOWN'));
 assert.ok(data.recommendations.every(v=>Object.values(v.experienceEvidence).every(e=>e.status==='SUPPORTED'&&e.sources.length)));
});
test('source-backed preferences and radius filters work against the saved dataset',async()=>{
 const initial=(await post({place:'Via Carota'})).data;
 const pasta=await post({place:'Via Carota',searchId:initial.searchId,selectedKeywords:['Pasta'],distanceKm:1});
 assert.equal(pasta.status,200);assert.equal(pasta.data.recommendations.length,1);
 assert.equal(pasta.data.recommendations[0].name,'Palma');assert.ok(pasta.data.recommendations[0].distance<=1);
 assert.equal((await post({place:'Via Carota',selectedKeywords:['Frozen yogurt']})).status,400);
 const terrace=(await post({place:'Via Carota',selectedKeywords:['Terrace dining']})).data;
 assert.equal(terrace.recommendations.length,0);
});
test('unsupported places, stale snapshots, other cities and unchecked free-text requests fail honestly',async()=>{
 assert.equal((await post({place:'Lilia'})).status,404);
 assert.equal((await post({place:'Via Carota',context:{city:'Paris'}})).status,400);
 assert.equal((await post({place:'Via Carota',searchId:'old-snapshot'})).status,410);
 assert.equal((await post({place:'Via Carota',context:{intent:'frozen yogurt'}})).status,400);
 assert.equal((await post({place:'Via Carota',context:{intent:'Pasta'}})).status,200);
});
test('every pilot record has matched identity, in-area coordinates and sources for every accepted claim',()=>{
 assert.equal(catalog.venues.length,96);assert.equal(new Set(catalog.venues.map(v=>v.id)).size,96);
 for(const venue of catalog.venues){
  assert.ok(['10014','10011'].includes(venue.zip));assert.ok(venue.latitude>40&&venue.longitude< -73);
  assert.equal(venue.identitySources.length,2);assert.ok(!('crowding' in venue));
  assert.ok(venue.features.every(f=>f.summary&&new URL(f.sourceUrl).protocol==='https:'));
  assert.ok(!('stars' in venue)&&!('price' in venue)&&!('hfMenu' in venue));
 }
});

test('every matched West Village record is searchable and optional website fields stay absent',async()=>{
 for(const venue of catalog.venues){const r=await post({place:venue.name});assert.equal(r.status,200,venue.name);assert.equal(r.data.searchedPlace.placeId,venue.id);}
 assert.equal(catalog.boundary.code,'MN0203');
 const plain=catalog.venues.find(v=>v.name==='CORNER BISTRO');assert.ok(!('website' in plain));
});
