const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
function load(file, imports = {}, extra = {}) {
  const source = fs.readFileSync(file, 'utf8') + (extra.append || '');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: id => imports[id] ?? ((id === '../lib/discovery-scope'||id === './discovery-scope') ? discoveryScope : id === '../lib/venue-links' ? venueLinks : id === '../lib/signed-search' ? signedSearch : id === '../lib/search-auth' ? {searchAuthHeaders:async()=>({})} : id === '../lib/place-lookup' ? {PlaceLookupUnavailableError:placeLookup.PlaceLookupUnavailableError,lookupPlace:async(query,city,key,signal,get)=>(await get('https://api.geoapify.com/v1/geocode/search?text='+encodeURIComponent([query,city].filter(Boolean).join(', ')),signal)).features?.[0]} : id === '../lib/gemini-json' ? {...geminiJson,createJsonGenerator:(ai,signal)=>geminiJson.createJsonGenerator(ai,signal)} : id === '../lib/place-evidence' ? evidence : id === '../lib/search-context' ? contextLib : id === '../lib/taste-profile' ? tasteLib : id === '../lib/personalization' ? personalization : id === './local-data' ? (extra.localStorage ? load('src/lib/local-data.ts',{}, {localStorage:extra.localStorage}) : localData) : require(id)), console, Buffer, TextEncoder,TextDecoder,Uint8Array,btoa,atob,AggregateError,URL, Request, Response, AbortController, AbortSignal, crypto: webcrypto, setTimeout, process: {env: {GEOAPIFY_API_KEY:'test', GEMINI_API_KEY:'test'}}, ...extra});
  return exports;
}
const discoveryScope=load('src/lib/discovery-scope.ts');
const venueLinks=load('src/lib/venue-links.ts');
const signedSearch=load('src/lib/signed-search.ts');
const placeLookup=load('src/lib/place-lookup.ts');
const localData=load('src/lib/local-data.ts');
const geminiJson = load("src/lib/gemini-json.ts");
const contextLib = load('src/lib/search-context.ts');
const tasteLib = load('src/lib/taste-profile.ts');
const feedback = load('src/lib/visit-feedback.ts');
const personalization = load('src/lib/personalization.ts');
const evidence = load('src/lib/place-evidence.ts');
const ranking = load('src/lib/places-ranking.ts');
function grounded(items, keywords) {
  for (const item of items) item.experienceEvidence = keywords.map(keyword => ({status:'SUPPORTED',summary:`${item.candidateId} explicitly offers ${keyword}.`}));
  return {text:JSON.stringify({recommendations:items}),candidates:[{groundingMetadata:{
    groundingChunks:[{web:{uri:'https://example.com/menu',title:'Official menu'}}],
    groundingSupports:items.flatMap(item=>item.experienceEvidence.map(e=>({segment:{text:e.summary},groundingChunkIndices:[0]})))
  }}]};
}
const plain = value => JSON.parse(JSON.stringify(value));
test('keyword normalization and toggles deduplicate case and whitespace', () => {
  assert.deepEqual(plain(ranking.normalizeKeywords([' Art books ', 'art  books', null, '', 'Rare editions'])), ['Art books','Rare editions']);
  assert.deepEqual(plain(ranking.toggleKeyword(['Art books'], ' art books ')), []);
});
function candidate(id, fields = {}) {
  return {placeId:id, distance:3, similarityScore:80, localScore:50, distinctivenessScore:50, chainLikelihood:0, popularityScore:50, keywordScores:{focus:0}, ...fields};
}
test('each preference can change the winning candidate', () => {
  const candidates = [candidate('local', {localScore:100, popularityScore:60}), candidate('hidden', {distinctivenessScore:100, popularityScore:0, localScore:60}), candidate('popular', {popularityScore:100, similarityScore:95}), candidate('near', {distance:0.1})];
  for (const [mode, expected] of [['local','local'],['hidden-gem','hidden'],['popular-worth-it','popular'],['closest','near']]) {
    assert.equal(ranking.rankCandidates(candidates, mode, [], null)[0].placeId, expected, mode);
  }
});
test('distance limits are inclusive, exclude unknown distance, and all removes the radius', () => {
  const candidates = [0.9,1,1.001,2,2.001,5,5.001,null].map((distance,i) => candidate(String(i), {distance}));
  for (const [limit, count] of [[1,2],[2,4],[5,6],[null,8]]) assert.equal(ranking.rankCandidates(candidates,'local',[],limit).length, count);
});
for (const [query, family, keyword] of [["Cédric Grolet Opéra",'bakery_pastry',"trompe-l'oeil desserts"],['City bookstore','books','rare editions'],['Skyline lookout','viewpoint','sunset photography']]) {
  test(`${family}: real API handler preserves chips and reranks without repeat provider calls`, async () => {
    let calls = 0, generations = 0;
    const feature = (id, lat = 0) => ({properties:{name:id, place_id:id, city:'New York', country:'United States', categories:[family]}, geometry:{coordinates:[-74,40.7+lat]}});
    const mockFetch = async url => {
      calls++;
      if (url.includes('/v2/places')) return Response.json({features:[feature('original'), {...feature('alternate-original-id'), properties:{...feature('original').properties, place_id:'alternate-original-id'}}, feature('broad',0.02),feature('focus',0.005),feature('focus',0.005),feature('far',0.05)]});
      return Response.json({features:[feature(url.includes('type=city') ? 'city' : 'original')]});
    };
    class AI {models = {generateContent: async ({contents}) => {
      generations++;
      if (contents.includes('experience-understanding')) return {text:JSON.stringify({category:family,categoryFamily:family,experienceKeywords:[keyword, ` ${keyword.toUpperCase()} `, 'atmosphere']})};
      return grounded(['candidate-0','candidate-1','candidate-2','invented'].map((candidateId,i) => ({candidateId,similarityScore:i===0?90:80,localScore:70,distinctivenessScore:60,chainLikelihood:0,popularityScore:40,keywordScores:[i===1?100:0,50]})), [keyword,'atmosphere']);
    }}}
    const api = load('src/lib/live-place-search.ts', {'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking}, {fetch:mockFetch});
    async function post(body) { const response = await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,...body})})); assert.equal(response.status,200);return response.json(); }
    const first = await post({});
    assert.equal(first.recommendations[0].name,'broad');
    assert.equal(first.candidateCount,3);
    assert.equal(first.classification.experienceKeywords.length,2);
    const initialCalls = calls;
    const focused = await post({searchId:first.searchId,selectedKeywords:[` ${keyword.toUpperCase()} `,keyword]});
    assert.equal(focused.recommendations[0].name,'focus');
    assert.deepEqual(focused.selectedKeywords,[keyword]);
    assert.deepEqual(focused.classification,first.classification);
    assert.equal(focused.recommendations.length,3);
    for (const [distanceKm,count] of [[1,1],[2,1],[5,2],['all',3]]) {
      const result = await post({searchId:first.searchId,distanceKm});
      assert.equal(result.candidateCount,count);
      assert.equal(result.recommendations.length,count);
    }
    const otherWorker = load('src/lib/live-place-search.ts', {'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking}, {fetch:mockFetch});
    const replay = await otherWorker.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,searchId:first.searchId,preference:'closest'})}));
    assert.equal(replay.status,200);
    const tampered = await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,searchId:'x'+first.searchId})}));
    assert.equal(tampered.status,410);
    assert.equal(generations,2); assert.equal(calls,initialCalls);
    const expired = await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,searchId:'missing'})}));
    assert.equal(expired.status,410);
  });
}

test('distance applies immediately; other draft filters, repeated updates and stale responses remain safe', async () => {
  const slots = [], pendingEffects = [], requests = [];
  let cursor = 0;
  const react = {
    useState(initial) {const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial) {const i=cursor++;return slots[i] ??= {current:initial};},
    useMemo(fn) {return fn();},
    useCallback(fn) {return fn;},
    useEffect(fn,deps) {const i=cursor++;const prior=slots[i];if (!prior || deps.some((v,j)=>v!==prior.deps[j])) {pendingEffects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
  };
  const jsx = (type,props,key) => ({type,props,key});
  const screen = load('src/app/results.tsx', {
    '../lib/discovery-profile':{readDiscoveryProfile:()=>({signals:[]})},
    '../components/area-heatmap':{default:()=>null},
    '../lib/use-area-agent':{useAreaAgent:()=>({result:null,loading:false,error:'',now:Date.now()})},
    '../lib/crowd-agent':load('src/lib/crowd-agent.ts',{'./pilot-catalog':{checkedVenues:[]},'./crowd-evidence':{evaluateCrowd:()=>({label:'unknown',reports:0})}}),
    '../lib/crowd-evidence':{describeReading:()=>''},
    '../components/search-suggestions':{default:()=>null},
    '../components/booking-panel':{default:()=>null},
    '../components/brand':{default:()=>null},
    '../components/account-provider':{useAccount:()=>({dataVersion:0})},
    react, 'react/jsx-runtime':{jsx,jsxs:jsx},
    'expo-router':{router:{},useFocusEffect:()=>{},useLocalSearchParams:()=>({place:'New query'})},
    'react-native':Object.fromEntries(['ActivityIndicator','Pressable','ScrollView','Text','TextInput','View'].map(name=>[name,name]).concat([['StyleSheet',{create:x=>x}]])),
    '../lib/places-ranking':ranking,
  }, {append:'\nexport { SearchResults };',fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
  let tree;
  function render() {cursor=0;tree=screen.SearchResults({searchedQuery:'Bookstore'});while(pendingEffects.length) pendingEffects.shift()();return tree;}
  function nodes(node) {if(!node || typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
  function button(label) {const node=nodes(tree).find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes(label));assert.ok(node,label);return node;}
  async function press(label) {const node=button(label);if(!node.props.disabled)node.props.onPress();render();await new Promise(setImmediate);}
  function summary() {return nodes(tree).find(n=>n.props?.testID==='applied-filter-summary')?.props.children;}
  async function resolve(index, name, keywords=['Rare editions','Reading room']) {
    requests[index].resolve(Response.json({success:true,searchId:'snapshot',searchedPlace:{name:'Bookstore'},classification:{category:'Books',categoryFamily:'books',experienceKeywords:keywords},recommendations:[{name,distance:0.5,elsewhereScore:90,categories:[]}]}));
    await new Promise(setImmediate);render();
  }
  render();await new Promise(setImmediate);
  const emptyContext=plain(contextLib.normalizeSearchContext({tasteProfile:[]}));
  assert.deepEqual(JSON.parse(requests[0].options.body),{place:'Bookstore',context:emptyContext,preference:'local',distanceKm:'all',selectedKeywords:[]});
  await resolve(0,'initial');
  await press('Filters & preferences');
  assert.equal(summary(),'Local · Citywide');
  assert.equal(button('Apply filters').props.disabled,true);
  await press('Rare editions');await press('Hidden gems');
  assert.equal(requests.length,1,'Draft edits must not fetch');
  assert.ok(JSON.stringify(tree).includes('initial'));
  assert.equal(summary(),'Local · Citywide');
  await press('2 km');
  assert.equal(requests.length,2,'Distance must update results without Apply filters');
  const apply=button('Apply filters').props.onPress;
  apply();apply();apply();render();await new Promise(setImmediate);
  assert.equal(requests.length,2,'Repeated taps submit once');
  assert.deepEqual(JSON.parse(requests[1].options.body),{place:'Bookstore',context:emptyContext,searchId:'snapshot',preference:'hidden-gem',distanceKm:2,selectedKeywords:['Rare editions']});
  assert.equal(summary(),'Local · Citywide','Summary stays with displayed results while updating');
  assert.ok(JSON.stringify(tree).includes('initial'),'Old cards stay visible while updating');
  await press('Closest');await press('Apply filters');
  assert.equal(requests[1].options.signal.aborted,true);
  assert.equal(JSON.parse(requests[2].options.body).preference,'closest');
  await press('Popular'); // Edit draft while the applied request is running.
  assert.equal(requests.length,3);
  await resolve(2,'latest',['Changed wording']);
  await resolve(1,'stale');
  assert.equal(summary(),'Closest · within 2 km · Rare editions');
  assert.equal(button('Popular').props['aria-checked'],true,'Response must not overwrite draft');
  const output=JSON.stringify(tree);
  assert.ok(output.includes('latest'));assert.ok(!output.includes('stale'));assert.ok(output.includes('Rare editions'));assert.ok(!output.includes('Changed wording'));
  await press('Apply filters');
  requests[3].resolve(Response.json({success:false,error:'Temporary test failure'},{status:503}));
  await new Promise(setImmediate);render();
  assert.ok(JSON.stringify(tree).includes('latest'));
  assert.equal(summary(),'Closest · within 2 km · Rare editions');
  assert.equal(button('Apply filters').props.disabled,false,'Failed request can be retried without changing the draft');
  await press('Apply filters');await resolve(4,'retried');
  assert.equal(summary(),'Popular · within 2 km · Rare editions');
  await press('Apply filters');assert.equal(requests.length,5,'Already applied filters must not refetch');
  await press('1 km');assert.equal(requests.length,6,'Radius changes need just one tap');await press('Apply filters');assert.equal(JSON.parse(requests[5].options.body).distanceKm,1);
  for(const slot of slots) slot?.cleanup?.();
  const before=JSON.stringify(slots);
  requests[5].resolve(Response.json({success:true,recommendations:[{name:'unmounted'}]}));
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(slots),before);
  assert.equal(screen.default().key,'New query');
});

for (const failure of ['invalid JSON', 'truncated JSON', 'missing candidate', 'missing keyword score']) {
  test(`API recovers from ${failure} after rate-limited model fallback`, async () => {
    const models = [];
    let rankingAttempts = 0;
    const feature = (id, lat=0) => ({properties:{name:id,place_id:id,city:'New York',country:'United States'},geometry:{coordinates:[-74,40.7+lat]}});
    class AI {models = {generateContent: async ({model,contents,config}) => {
      models.push(model);
      if(!(model==='gemini-2.5-flash'&&config.tools))assert.ok(config.responseJsonSchema);
      if(model !== 'gemini-3.5-flash-lite') throw Object.assign(new Error('Rate limited'),{status:429});
      if(contents.includes('experience-understanding')) return {text:JSON.stringify({category:'Bookstore',categoryFamily:'books',experienceKeywords:['Rare editions','Reading room']})};
      rankingAttempts++;
      const item={candidateId:'candidate-0',similarityScore:80,localScore:85,distinctivenessScore:80,chainLikelihood:0,popularityScore:20,keywordScores:[90,60]};
      if(rankingAttempts===1) {
        if(failure==='invalid JSON')return {text:'{"recommendations":['};
        if(failure==='truncated JSON')return {text:JSON.stringify({recommendations:[item]}),candidates:[{finishReason:'MAX_TOKENS'}]};
        if(failure==='missing candidate')return {text:'{"recommendations":[]}'};
        item.keywordScores.pop();
      }
      assert.deepEqual(plain(config.tools), [{googleSearch:{}}]);
      return grounded([item], ['Rare editions','Reading room']);
    }}}
    const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking},{fetch:async url=>Response.json({features:url.includes('/v2/places')?[feature('alternative',0.001)]:[feature(url.includes('type=city')?'city':'original')]})});
    const request = body=>new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Bookstore',...body})});
    const response=await api.POST(request({}));
    assert.equal(response.status,200);
    const initial=await response.json();
    assert.equal(initial.recommendations[0].name,'alternative');
    assert.equal(models.filter(model=>model==='gemini-3.5-flash').length,2);
    assert.equal(models.filter(model=>model==='gemini-3.7-flash').length,2);
    assert.equal(rankingAttempts,2);
    const filtered=await(await api.POST(request({searchId:initial.searchId,selectedKeywords:['Rare editions']}))).json();
    assert.deepEqual(filtered.classification,initial.classification);
    assert.equal(filtered.recommendations[0].focusMatchScore,90);
    assert.equal(rankingAttempts,2);
  });
}

test('JSON generation has bounded retries and honors cancellation', async()=>{
  let attempts=0;
  const controller=new AbortController();
  const generate=geminiJson.createJsonGenerator({models:{generateContent:async()=>{attempts++;return {text:'broken JSON'};}}},controller.signal);
  await assert.rejects(generate('prompt',{},data=>data),error=>error.name==='InterpretationUnavailableError');
  assert.equal(attempts,8);
  controller.abort();
  const cancelled=geminiJson.createJsonGenerator({models:{generateContent:async()=>{throw Error('Must not run');}}},controller.signal);
  await assert.rejects(cancelled('prompt',{},data=>data),error=>error.name==='AbortError');
});


test('finalists favor category relevance across the city without proximity ordering', () => {
  const candidates = Array.from({length:40}, (_,i)=>({candidateId:`c${i}`,name:'Shop',categories:['commercial'],distance:0.1}));
  candidates.push({candidateId:'far-specialist',name:'Artisan pastry',categories:['commercial.food_and_drink.bakery'],distance:15});
  const before=JSON.stringify(candidates);
  const selected=evidence.selectFinalists(candidates,['commercial.food_and_drink.bakery','commercial'],['pastry']);
  assert.equal(selected.length,30);
  assert.equal(selected[0].candidateId,'far-specialist');
  assert.equal(JSON.stringify(candidates),before);
});

test('specific experiences require claim-linked provider citations; missing evidence remains unknown', () => {
  const raw={status:'SUPPORTED',summary:'Maison Example explicitly offers fruit-shaped trompe-l’oeil desserts.'};
  const response=grounded([{candidateId:'x'}],['pastry']);
  assert.equal(evidence.readExperienceEvidence(raw,response).status,'UNKNOWN','Unrelated citations must not support this claim');
  assert.equal(evidence.readExperienceEvidence({...raw,sources:['https://invented.example']},{}).status,'UNKNOWN');
  response.candidates[0].groundingMetadata.groundingSupports[0].segment.text=raw.summary;
  const supported=evidence.readExperienceEvidence(raw,response);
  assert.equal(supported.status,'SUPPORTED');
  assert.equal(supported.sources[0].url,'https://example.com/menu');
  assert.equal(evidence.readExperienceEvidence({...raw,status:'NOT_SUPPORTED',basis:'EXPLICIT_DENIAL'},response).status,'NOT_SUPPORTED');
  assert.equal(evidence.readExperienceEvidence({...raw,status:'UNKNOWN'},response).status,'UNKNOWN');
  response.candidates[0].groundingMetadata.groundingChunks[0].web.uri='javascript:alert(1)';
  assert.equal(evidence.readExperienceEvidence(raw,response).status,'UNKNOWN');
});

test('API never promotes uncited experience guesses into focus scores', async () => {
  const feature=id=>({properties:{name:id,place_id:id,city:'New York',country:'United States',categories:['commercial.books']},geometry:{coordinates:[-74,40.7]}});
  class AI { models={generateContent:async ({contents,config})=> {
    if(contents.includes('experience-understanding'))return {text:JSON.stringify({category:'Books',categoryFamily:'books',experienceKeywords:['Rare editions','Reading room']})};
    assert.ok(config.tools[0].googleSearch);
    return {text:JSON.stringify({recommendations:[{candidateId:'candidate-0',similarityScore:80,localScore:60,distinctivenessScore:60,chainLikelihood:0,popularityScore:30,keywordScores:[100,100],experienceEvidence:[{status:'SUPPORTED',summary:'A confident but uncited claim about rare editions.'},{status:'UNKNOWN',summary:'No evidence.'}],whySimilar:'Bookshop.',whyTryInstead:'Explore its selection.'}]})};
  }} }
  const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking},{fetch:async url=>Response.json({features:url.includes('/v2/places')?[feature('alternative')]:[feature(url.includes('type=city')?'city':'original')]})});
  const initial=await(await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Original bookstore'})}))).json();
  const item=initial.recommendations[0];
  assert.equal(item.keywordScores['Rare editions'],0);
  assert.equal(item.experienceEvidence['Rare editions'].status,'UNKNOWN');
  const filtered=await(await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Original bookstore',searchId:initial.searchId,selectedKeywords:['Rare editions']})}))).json();
  assert.equal(filtered.recommendations.length,0);
});

test('dinner context validates calendar dates, time, guests and bounded taste input', () => {
  const good=contextLib.normalizeSearchContext({mode:'tonight',city:' New York ',intent:' handmade pasta ',date:'2026-11-02',time:'20:30',partySize:'4',taste:['pasta','pasta','date night']});
  assert.equal(good.city,'New York');assert.equal(good.intent,'handmade pasta');assert.equal(good.partySize,4);
  assert.deepEqual(plain(good.taste),['pasta','date night']);
  const invalid=contextLib.normalizeSearchContext({date:'2026-02-30',time:'25:00',partySize:100});
  assert.equal(invalid.date,'');assert.equal(invalid.time,'19:00');assert.equal(invalid.partySize,2);
  const url=new URL(contextLib.bookingSearchUrl('Example & Co','New York',good));
  assert.equal(url.hostname,'www.google.com');
  assert.match(url.searchParams.get('q'),/2026-11-02 20:30 4 people/);
});

test('dinner matching uses intent, preserves plans across filters and rejects changed-context replay', async () => {
  let generations=0;const calls=[];
  const feature=id=>({properties:{name:id,place_id:id,city:'New York',country:'United States',categories:['catering.restaurant']},geometry:{coordinates:[-74,40.7]}});
  class AI {models={generateContent:async({contents})=>{
    generations++;
    assert.ok(contents.includes('handmade pasta'));
    if(contents.includes('experience-understanding'))return {text:JSON.stringify({category:'Italian restaurant',categoryFamily:'restaurant',experienceKeywords:['Handmade pasta','Intimate dining'],intentSummary:'Handmade pasta for a relaxed dinner.'})};
    return grounded([{candidateId:'candidate-0',similarityScore:90,localScore:80,distinctivenessScore:70,chainLikelihood:0,popularityScore:50,keywordScores:[95,80]}],['Handmade pasta','Intimate dining']);
  }}}
  const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking},{fetch:async url=>{calls.push(url);return Response.json({features:[feature(url.includes('/v2/places')?'alternative':url.includes('type=city')?'city':'original')]});}});
  const context=contextLib.normalizeSearchContext({mode:'tonight',city:'New York',intent:'handmade pasta',date:'2026-11-02',time:'19:30',partySize:2});
  const post=body=>api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Famous restaurant',context,...body})}));
  const response=await post({});assert.equal(response.status,200);const initial=await response.json();
  assert.equal(initial.classification.intentSummary,'Handmade pasta for a relaxed dinner.');
  assert.equal(initial.recommendations[0].booking.status,'UNVERIFIED');
  assert.equal(initial.recommendations[0].booking.partySize,2);
  assert.match(decodeURIComponent(calls[0]),/Famous restaurant, New York/);
  const filtered=await(await post({searchId:initial.searchId,preference:'closest'})).json();
  assert.deepEqual(filtered.context,plain({...context,city:'New York City'}));assert.equal(generations,2);
  assert.equal((await post({searchId:initial.searchId,context:{...context,partySize:4}})).status,410);
});

test('saved-place taste hints update, persist and remove without duplicates', () => {
  const store=new Map();const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  const profile=load('src/lib/taste-profile.ts',{}, {localStorage});
  profile.toggleSavedPlace({id:'a',name:'A',address:'City',interests:['pasta','cozy']});
  profile.toggleSavedPlace({id:'b',name:'B',address:'City',interests:['pasta']});
  assert.equal(profile.tasteInterests()[0],'pasta');
  assert.equal(load('src/lib/taste-profile.ts',{}, {localStorage}).readSavedPlaces().length,2);
  assert.equal(profile.toggleSavedPlace({id:'a',name:'A',address:'City',interests:[]}).length,1);
});


test('grounding quota uses explicit metadata fallback without further model guesses', async () => {
  let fallback=false;const modes=[];
  const generate=geminiJson.createJsonGenerator({models:{generateContent:async ({config})=>{
    modes.push(Boolean(config.tools));
    if(config.tools)throw Object.assign(new Error('Quota exhausted'),{status:429});
    return grounded([{candidateId:'a'}],['specific product']);
  }}},new AbortController().signal);
  const result=await generate('prompt',{},(data,response)=>evidence.readExperienceEvidence(data.recommendations[0].experienceEvidence[0],response),{googleSearch:true,metadataFallback:()=>{fallback=true;return {status:'UNKNOWN'};}});
  assert.equal(fallback,true);assert.equal(result.status,'UNKNOWN');
  assert.equal(modes.filter(Boolean).length,4);assert.equal(modes.length,4);
});

test('network timeouts exhaust providers with a recoverable comparison error', async () => {
  const generate=geminiJson.createJsonGenerator({models:{generateContent:async()=>{throw Object.assign(new Error('Request timed out'),{code:'ETIMEDOUT'});}}},new AbortController().signal);
  await assert.rejects(generate('prompt',{},data=>data),error=>error.name==='InterpretationUnavailableError');
});


test('dinner plans persist, update one venue and remove without claiming a booking', () => {
  const store=new Map();const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  const plans=load('src/lib/dinner-plans.ts',{'./search-context':contextLib},{localStorage});
  const context=contextLib.normalizeSearchContext({mode:'tonight',city:'New York',date:'2026-11-02',time:'19:00',partySize:2});
  plans.saveDinnerPlan({id:'venue',name:'Restaurant',address:'New York',context});
  assert.equal(plans.readDinnerPlans().length,1);
  plans.saveDinnerPlan({id:'venue',name:'Restaurant',address:'New York',context:{...context,partySize:4}});
  assert.equal(plans.readDinnerPlans().length,1);
  assert.equal(plans.readDinnerPlans()[0].context.partySize,4);
  assert.equal(load('src/lib/dinner-plans.ts',{'./search-context':contextLib},{localStorage}).readDinnerPlans().length,1);
  assert.equal(plans.readDinnerPlans()[0].status,undefined);
  assert.equal(plans.removeDinnerPlan('venue').length,0);
});


test('visit ratings learn only explicit likes from high ratings and survive saved-place removal',()=>{
 const store=new Map();const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 const visits=load('src/lib/visit-feedback.ts',{}, {localStorage});
 visits.saveVisit({id:'a',name:'A',address:'City',rating:5,liked:['Handmade pasta'],note:'Loved it'});
 visits.saveVisit({id:'b',name:'B',address:'City',rating:2,liked:['Quiet setting'],note:'Not for me'});
 assert.deepEqual(plain(visits.learnedTaste()),['Handmade pasta']);
 assert.equal(load('src/lib/visit-feedback.ts',{}, {localStorage}).readVisits().length,2);
 visits.saveVisit({id:'a',name:'A',address:'City',rating:1,liked:[],note:''});
 assert.deepEqual(plain(visits.learnedTaste()),[]);
 assert.throws(()=>visits.saveVisit({id:'c',rating:6}),/rating/);
 assert.equal(visits.removeVisit('a').length,1);
});

test('taste boosts require supported evidence and remain secondary to explicit intent',()=>{
 const supported={experienceEvidence:{pasta:{status:'SUPPORTED',summary:'Serves handmade pasta.',sources:[]}}};
 const unknown={experienceEvidence:{pasta:{status:'UNKNOWN',summary:'Handmade pasta is not verified.',sources:[]}}};
 const results=personalization.personalizeCandidates([supported,unknown],['Handmade pasta'],true);
 assert.equal(results[0].personalizationBoost,0);assert.equal(results[0].personalizationTieBreak,1);assert.equal(results[1].personalizationBoost,0);
 const many=personalization.personalizeCandidates([supported],['pasta','handmade','handmade pasta'],true);
 assert.equal(many[0].personalizationBoost,0);assert.equal(many[0].personalizationTieBreak,3);
 const ranked=ranking.rankCandidates([candidate('off-target',{similarityScore:20,personalizationBoost:6}),candidate('relevant',{similarityScore:90})],'local',[],null);
 assert.equal(ranked.length,1);assert.equal(ranked[0].placeId,'relevant');
});


test('unnamed place records cannot turn an address into a recommended business',()=>{
 const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:class{}},'../lib/places-ranking':ranking},{append:'\nexport {featureToCandidate};'});
 const unknown=api.featureToCandidate({properties:{address_line1:'Example Street',formatted:'Example Street, City'},geometry:{coordinates:[0,0]}},0,0);
 assert.equal(unknown.name,'Unnamed place');
 const named=api.featureToCandidate({properties:{name:' Real Bakery ',address_line1:'Example Street'},geometry:{coordinates:[0,0]}},0,0);
 assert.equal(named.name,'Real Bakery');
});


test('Gemini 2.5 grounding uses plain JSON text with search rather than unsupported structured tool output',async()=>{
 let seen;
 const generate=geminiJson.createJsonGenerator({models:{generateContent:async request=>{seen=request;return {text:'```json\n{"ok":true}\n```'};}}},new AbortController().signal);
 const result=await generate('Return JSON',{},data=>data,{googleSearch:true});
 assert.equal(result.ok,true);assert.equal(seen.model,'gemini-2.5-flash');
 assert.ok(seen.config.tools[0].googleSearch);assert.equal(seen.config.responseMimeType,undefined);assert.equal(seen.config.responseJsonSchema,undefined);
});
test('absence of search evidence is never treated as proof that a venue lacks an offering',()=>{
 const summary='No information available to suggest that Maison Example offers fruit pastries.';
 const response=grounded([{candidateId:'a'}],['pastries']);response.candidates[0].groundingMetadata.groundingSupports[0].segment.text=summary;
 assert.equal(evidence.readExperienceEvidence({status:'NOT_SUPPORTED',summary},response).status,'UNKNOWN');
});

test('place discovery recovers from a transient provider timeout',async()=>{
 let calls=0;
 const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:class{}},'../lib/places-ranking':ranking},{append:'\nexport {fetchJson};',fetch:async()=>{calls++;if(calls===1)throw Object.assign(new Error('temporary'),{name:'TimeoutError'});return Response.json({features:[]});}});
 assert.deepEqual(plain(await api.fetchJson('https://example.com',new AbortController().signal)),{features:[]});assert.equal(calls,2);
});
test('place discovery returns a clear service error after bounded retries and honors cancellation',async()=>{
 let calls=0;
 const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:class{}},'../lib/places-ranking':ranking},{append:'\nexport {fetchJson};',fetch:async()=>{calls++;return Response.json({},{status:503});}});
 await assert.rejects(api.fetchJson('https://example.com',new AbortController().signal),/temporarily unavailable/);assert.equal(calls,2);
 const controller=new AbortController();controller.abort();await assert.rejects(api.fetchJson('https://example.com',controller.signal),error=>error.name==='AbortError');assert.equal(calls,2);
});


test('negative experience claims require an explicit source denial, never a missing mention',()=>{
 const summary="Carl Example offers pastries, but no explicit mention of fruit-shaped desserts.";
 const response=grounded([{candidateId:'a'}],['pastry']);response.candidates[0].groundingMetadata.groundingSupports[0].segment.text=summary;
 assert.equal(evidence.readExperienceEvidence({status:'NOT_SUPPORTED',basis:'EXPLICIT_DENIAL',summary},response).status,'UNKNOWN');
 assert.equal(evidence.readExperienceEvidence({status:'NOT_SUPPORTED',summary:'This venue does not serve fruit-shaped desserts.'},response).status,'UNKNOWN');
});

test('place cache avoids repeat calls, uses recent real data during outages, and expires it', async () => {
  let calls=0, now=0, unavailable=false;
  const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:class{}},'../lib/places-ranking':ranking},{
    append:'\nexport {fetchJson};', Date:{now:()=>now},
    fetch:async()=>{calls++;return unavailable?Response.json({},{status:503}):Response.json({features:[{properties:{name:'Real venue'}}]});},
  });
  const signal=new AbortController().signal;
  const url='https://example.com/v2/places';
  const first=await api.fetchJson(url,signal);
  assert.deepEqual(plain(await api.fetchJson(url,signal)),plain(first));
  assert.equal(calls,1);
  unavailable=true;now=16*60_000;
  assert.deepEqual(plain(await api.fetchJson(url,signal)),plain(first));
  assert.equal(calls,3);
  now=25*60*60_000;
  await assert.rejects(api.fetchJson(url,signal),/temporarily unavailable/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(api.fetchJson(url,controller.signal),error=>error.name==='AbortError');
});

test('category discovery starts together and retains real matches when one category fails', async () => {
  let release;
  const barrier=new Promise(resolve=>{release=resolve;});
  const started=[];
  const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:class{}},'../lib/places-ranking':ranking},{
    append:'\nexport {discoverCityCandidates};',
    fetch:async url=>{const category=new URL(url).searchParams.get('categories');started.push(category);if(started.length===2)release();await barrier;
      if(category==='catering.cafe')return Response.json({},{status:503});
      return Response.json({features:[{properties:{name:'A bakery',place_id:'bakery',city:'New York',country:'United States',categories:['commercial.food_and_drink.bakery']},geometry:{coordinates:[-74,40.7]}}]});},
  });
  const result=await api.discoverCityCandidates({cityPlaceId:'paris',categories:['catering.cafe','commercial.food_and_drink.bakery'],searchedLatitude:48.8,searchedLongitude:2.3,searchedPlaceId:'original',searchedPlaceName:'Original',originalQuery:'Original',geoapifyApiKey:'test',requestSignal:new AbortController().signal});
  assert.equal(result.length,1);assert.equal(result[0].name,'A bakery');
  assert.deepEqual(started.slice(0,2),['catering.cafe','commercial.food_and_drink.bakery']);
});

test('city-boundary failure falls back to a real nearby search and preserves its scope on reranking', async () => {
  let radiusQueries=0;
  const feature=id=>({properties:{name:id,place_id:id,city:'New York',country:'United States',categories:['commercial.books']},geometry:{coordinates:[-74,40.7]}});
  class AI {models={generateContent:async({contents})=>contents.includes('experience-understanding')
    ?{text:JSON.stringify({category:'Books',categoryFamily:'books',experienceKeywords:['Rare editions','Reading room']})}
    :grounded([{candidateId:'candidate-0',similarityScore:80,localScore:60,distinctivenessScore:60,chainLikelihood:0,popularityScore:30,keywordScores:[80,50]}],['Rare editions','Reading room'])};}
  const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking},{fetch:async url=>{
    if(url.includes('type=city'))return Response.json({},{status:503});
    if(url.includes('/v2/places')){assert.equal(new URL(url).searchParams.get('filter'),'circle:-74,40.7,15000');radiusQueries++;return Response.json({features:[feature('Alternative')]});}
    return Response.json({features:[feature('Original')]});
  }});
  const post=async body=>{const response=await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Original bookstore',...body})}));assert.equal(response.status,200);return response.json();};
  const initial=await post({});
  assert.equal(initial.searchArea,'nearby');assert.equal(initial.recommendations[0].name,'Alternative');
  const filtered=await post({searchId:initial.searchId,distanceKm:1});
  assert.equal(filtered.searchArea,'nearby');assert.equal(radiusQueries,1);
});

test('venue lookup validates city and business name and recovers through the alternate endpoint', async () => {
 const feature=(name,city='Paris',type='amenity')=>({properties:{name,city,country:'France',result_type:type},geometry:{coordinates:[2.33,48.86]}});
 assert.equal(placeLookup.matchingPlace([feature('Paris','Paris','city')],'Cédric Grolet, Paris'),null);
 assert.equal(placeLookup.matchingPlace([feature('Cédric Grolet Opéra','London')],'Cédric Grolet Opéra, Paris'),null);
 assert.equal(placeLookup.matchingPlace([feature('Cédric Grolet Opéra')],'Cedric Grolet Opera, Paris').properties.name,'Cédric Grolet Opéra');
 const calls=[];
 const found=await placeLookup.lookupPlace('Cedric Grolet Opera','Paris','key',new AbortController().signal,async url=>{calls.push(url);if(calls.length===1)throw new Error('timeout');return {features:[feature('Cédric Grolet Opéra')]};});
 assert.equal(found.properties.city,'Paris');assert.ok(calls[0].includes('/autocomplete'));assert.ok(calls[1].includes('/search'));
 const controller=new AbortController();controller.abort();
 await assert.rejects(placeLookup.lookupPlace('Place','Paris','key',controller.signal,async()=>{throw Error('must not run')}),error=>error.name==='AbortError');
});

test('explicit dislikes persist and only penalize verified matches while current intent remains first', () => {
 const store=new Map();const localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
 const visits=load('src/lib/visit-feedback.ts',{}, {localStorage});
 visits.saveVisit({id:'a',name:'A',address:'City',rating:2,liked:[],disliked:['Lively setting'],note:''});
 assert.deepEqual(plain(visits.learnedAvoids()),['Lively setting']);
 const input=[{experienceEvidence:{'Lively setting':{status:'SUPPORTED',summary:'Lively setting',sources:[]}}},{experienceEvidence:{'Lively setting':{status:'UNKNOWN',summary:'Not verified',sources:[]}}}];
 const results=personalization.personalizeCandidates(input,[],false,visits.learnedAvoids());
 assert.equal(results[0].personalizationPenalty,2);assert.equal(results[1].personalizationPenalty,0);
 assert.equal(personalization.personalizeCandidates(input,[],true,visits.learnedAvoids())[0].personalizationPenalty,0);
 visits.removeVisit('a');assert.deepEqual(plain(visits.learnedAvoids()),[]);
});

test('grounded research has independent model availability and successful responses cache by scope', async () => {
 let calls=0;
 const ai={models:{generateContent:async({model,config})=>{calls++;if(model==='gemini-2.5-flash'&&!config.tools)throw Object.assign(Error('plain quota'),{status:429});return {text:'{"ok":true}'};}}};
 const generate=geminiJson.createJsonGenerator(ai,new AbortController().signal,'cache-test-scope');
 await generate('classify',{},data=>data);
 const before=calls;
 await generate('research',{},data=>data,{googleSearch:true});
 assert.equal(calls,before+1,'Search can use 2.5 even if plain generation hit its quota');
 await generate('research',{},data=>data,{googleSearch:true});assert.equal(calls,before+1);
 const another=geminiJson.createJsonGenerator(ai,new AbortController().signal,'different-scope');
 await another('research',{},data=>data,{googleSearch:true});assert.equal(calls,before+2);
});

test('patched query parser preserves the CommonJS API used by routing',()=>{
 const query=require('../src/lib/query-string-compat.cjs');
 assert.equal(typeof query.stringify,'function');assert.equal(typeof query.parse,'function');
 const value={place:'Cédric Grolet, Paris',context:JSON.stringify({intent:'Food & products'})};
 const roundTrip=query.parse(query.stringify(value));assert.equal(roundTrip.place,value.place);assert.equal(roundTrip.context,value.context);
});

test('research returns a labeled metadata fallback when its shared time budget expires',async()=>{
 let now=0,calls=0;const budgeted=load('src/lib/gemini-json.ts',{}, {Date:{now:()=>now}});
 const ai={models:{generateContent:async()=>{calls++;now+=91_000;throw Object.assign(Error('timeout'),{name:'TimeoutError'});}}};
 const generate=budgeted.createJsonGenerator(ai,new AbortController().signal);
 const result=await generate('research',{},value=>value,{googleSearch:true,metadataFallback:()=>({unverified:true})});
 assert.equal(result.unverified,true);assert.equal(calls,1);
 await generate('next batch',{},value=>value,{googleSearch:true,metadataFallback:()=>({unverified:true})});assert.equal(calls,1);
});

test('selected preferences take priority over general popularity and similarity scores',()=>{
 const broad=candidate('broad',{similarityScore:100,localScore:100,distinctivenessScore:100,popularityScore:100,distance:0.1,keywordScores:{focus:0}});
 const specific=candidate('specific',{similarityScore:60,localScore:40,distinctivenessScore:40,popularityScore:10,distance:2,keywordScores:{focus:100}});
 for(const mode of ['local','hidden-gem','popular-worth-it','closest'])assert.equal(ranking.rankCandidates([broad,specific],mode,['focus'],null)[0].placeId,'specific');
});

test('every selected preference requires positive evidence with a safe source',()=>{
 const yes={status:'SUPPORTED',summary:'Confirmed offering.',sources:[{title:'Menu',url:'https://restaurant.com/menu'}]};
 const item={experienceEvidence:{food:yes,view:{...yes,status:'UNKNOWN'}}};
 assert.equal(evidence.matchesVerifiedPreferences(item,[]),true);
 assert.equal(evidence.matchesVerifiedPreferences(item,['food']),true);
 assert.equal(evidence.matchesVerifiedPreferences(item,['food','view']),false);
 assert.equal(evidence.matchesVerifiedPreferences({experienceEvidence:{food:{...yes,sources:[]}}},['food']),false);
 assert.equal(evidence.matchesVerifiedPreferences({experienceEvidence:{food:{...yes,sources:[{url:'javascript:alert(1)'}]}}},['food']),false);
});
test('URL context receives venue URLs but unsafe or malformed website metadata is excluded',async()=>{
 for(const url of ['http://venue.com','https://127.0.0.1','https://[::1]','https://localhost','https://venue.local','https://user:pass@venue.com','https://venue.com:8443','invalid'])assert.equal(evidence.venueWebsite(url),null,url);
 assert.equal(evidence.venueWebsite('https://venue.com/menu'),'https://venue.com/menu');
 let config;const ai={models:{generateContent:async request=>{config=request.config;return {text:'{}'};}}};
 await geminiJson.createJsonGenerator(ai,new AbortController().signal)('Read https://venue.com/menu',{},value=>value,{googleSearch:true,urlContext:true});
 assert.ok(config.tools.some(tool=>tool.urlContext));assert.ok(config.tools.some(tool=>tool.googleSearch));
 assert.equal(evidence.readExperienceEvidence({status:'SUPPORTED',summary:'Venue offers a terrace with a view.'},{candidates:[{urlContextMetadata:{urlMetadata:[{retrievedUrl:'https://venue.com',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'}]}}]}).status,'UNKNOWN');
});

test('booking destinations preserve supplied official links without constructing Google searches or booking paths',()=>{
 assert.equal(venueLinks.venueDestination('www.venue.com').url,'https://www.venue.com/');
 assert.equal(venueLinks.venueDestination('https://venue.com','https://bookings.provider.com/venue/123').url,'https://bookings.provider.com/venue/123');
 assert.equal(venueLinks.venueDestination(undefined),null);
 for(const url of ['javascript:alert(1)','https://user:password@venue.com','https://127.0.0.1','https://venue.local'])assert.equal(venueLinks.venueDestination(url),null,url);
});

test('ranking returns all matching researched candidates instead of truncating at ten',()=>{
 const places=Array.from({length:30},(_,i)=>candidate(String(i),{distance:i/10}));
 assert.equal(ranking.rankCandidates(places,'local',[],null).length,30);
 const nearby=ranking.rankCandidates(places,'local',[],1);
 assert.equal(nearby.length,11);assert.ok(nearby.every(place=>place.distance<=1));
});

test('NYC scope accepts all five boroughs and rejects nearby cities, other countries and invalid coordinates',()=>{
 const feature=(city,lon=-74,lat=40.7,state='New York',country='United States')=>({properties:{city,state,country},geometry:{coordinates:[lon,lat]}});
 for(const city of ['New York','New York City','Manhattan','Brooklyn','Queens','Bronx','Staten Island'])assert.equal(discoveryScope.isNycFeature(feature(city)),true,city);
 for(const item of [feature('Jersey City'),feature('New York',-74,40.7,'New Jersey'),feature('New York',2.3,48.8),feature('Paris'),feature('New York',-74,40.7,'New York','France'),feature('New York',NaN)])assert.equal(discoveryScope.isNycFeature(item),false);
});
test('outside-NYC requests and resolved venues stop before AI research',async()=>{
 let providerCalls=0,generations=0;
 class AI {models={generateContent:async()=>{generations++;throw Error('Research must not run');}};}
 const api=load('src/lib/live-place-search.ts',{'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking},{fetch:async()=>{providerCalls++;return Response.json({features:[{properties:{name:'Girafe',city:'Paris',country:'France'},geometry:{coordinates:[2.3,48.8]}}]});}});
 const post=context=>api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Girafe',context})}));
 assert.equal((await post({city:'Paris'})).status,400);assert.equal(providerCalls,0);
 assert.equal((await post({})).status,400);assert.equal(generations,0);
});
test('successful venue lookup uses a single provider request',async()=>{
 let calls=0;
 const result=await placeLookup.lookupPlace('Lilia','New York City','key',new AbortController().signal,async()=>{calls++;return {features:[{properties:{name:'Lilia',city:'Brooklyn',state:'New York',country:'United States',result_type:'amenity'},geometry:{coordinates:[-73.95,40.71]}}]};});
 assert.equal(result.properties.name,'Lilia');assert.equal(calls,1);
});
