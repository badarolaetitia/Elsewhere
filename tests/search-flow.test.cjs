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
  vm.runInNewContext(code, {exports, require: id => imports[id] ?? (id === '../lib/gemini-json' ? geminiJson : require(id)), console, Buffer, Request, Response, AbortController, AbortSignal, crypto: webcrypto, setTimeout, process: {env: {GEOAPIFY_API_KEY:'test', GEMINI_API_KEY:'test'}}, ...extra});
  return exports;
}
const geminiJson = load("src/lib/gemini-json.ts");
const ranking = load('src/lib/places-ranking.ts');
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
    const feature = (id, lat = 0) => ({properties:{name:id, place_id:id, city:'City', country:'Country', categories:[family]}, geometry:{coordinates:[0,lat]}});
    const mockFetch = async url => {
      calls++;
      if (url.includes('/v2/places')) return Response.json({features:[feature('original'), {...feature('alternate-original-id'), properties:{...feature('original').properties, place_id:'alternate-original-id'}}, feature('broad',0.02),feature('focus',0.005),feature('focus',0.005),feature('far',0.05)]});
      return Response.json({features:[feature(url.includes('type=city') ? 'city' : 'original')]});
    };
    class AI {models = {generateContent: async ({contents}) => {
      generations++;
      if (contents.includes('experience-understanding')) return {text:JSON.stringify({category:family,categoryFamily:family,experienceKeywords:[keyword, ` ${keyword.toUpperCase()} `, 'atmosphere']})};
      return {text:JSON.stringify({recommendations: ['candidate-0','candidate-1','candidate-2','invented'].map((candidateId,i) => ({candidateId,similarityScore:i===0?90:80,localScore:70,distinctivenessScore:60,chainLikelihood:0,popularityScore:40,keywordScores:[i===1?100:0,50]}))})};
    }}}
    const api = load('src/app/places+api.ts', {'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking}, {fetch:mockFetch});
    async function post(body) { const response = await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,...body})})); assert.equal(response.status,200);return response.json(); }
    const first = await post({});
    assert.equal(first.recommendations[0].name,'broad');
    assert.equal(first.candidateCount,3);
    assert.equal(first.classification.experienceKeywords.length,2);
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
    const otherWorker = load('src/app/places+api.ts', {'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking}, {fetch:mockFetch});
    const replay = await otherWorker.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,searchId:first.searchId,preference:'closest'})}));
    assert.equal(replay.status,200);
    const tampered = await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,searchId:'x'+first.searchId})}));
    assert.equal(tampered.status,410);
    assert.equal(generations,2); assert.equal(calls,3);
    const expired = await api.POST(new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:query,searchId:'missing'})}));
    assert.equal(expired.status,410);
  });
}

test('draft filters require explicit apply; repeated updates, stale responses, failures and draft edits remain safe', async () => {
  const slots = [], pendingEffects = [], requests = [];
  let cursor = 0;
  const react = {
    useState(initial) {const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial) {const i=cursor++;return slots[i] ??= {current:initial};},
    useMemo(fn) {return fn();},
    useEffect(fn,deps) {const i=cursor++;const prior=slots[i];if (!prior || deps.some((v,j)=>v!==prior.deps[j])) {pendingEffects.push(()=>{prior?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
  };
  const jsx = (type,props,key) => ({type,props,key});
  const screen = load('src/app/results.tsx', {
    react, 'react/jsx-runtime':{jsx,jsxs:jsx},
    'expo-router':{router:{},useLocalSearchParams:()=>({place:'New query'})},
    'react-native':Object.fromEntries(['ActivityIndicator','Pressable','ScrollView','Text','View'].map(name=>[name,name]).concat([['StyleSheet',{create:x=>x}]])),
    '../lib/places-ranking':ranking,
  }, {append:'\nexport { SearchResults };',fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
  let tree;
  function render() {cursor=0;tree=screen.SearchResults({searchedQuery:'Bookstore'});while(pendingEffects.length) pendingEffects.shift()();return tree;}
  function nodes(node) {if(!node || typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
  function button(label) {const node=nodes(tree).find(n=>n.type==='Pressable'&&JSON.stringify(n.props.children).includes(label));assert.ok(node,label);return node;}
  function press(label) {const node=button(label);if(!node.props.disabled)node.props.onPress();render();}
  function summary() {return nodes(tree).find(n=>n.props?.testID==='applied-filter-summary')?.props.children;}
  async function resolve(index, name, keywords=['Rare editions','Reading room']) {
    requests[index].resolve(Response.json({success:true,searchId:'snapshot',searchedPlace:{name:'Bookstore'},classification:{category:'Books',categoryFamily:'books',experienceKeywords:keywords},recommendations:[{name,distance:0.5,elsewhereScore:90,categories:[]}]}));
    await new Promise(setImmediate);render();
  }
  render();
  assert.deepEqual(JSON.parse(requests[0].options.body),{place:'Bookstore',preference:'local',distanceKm:'all',selectedKeywords:[]});
  await resolve(0,'initial');
  assert.equal(summary(),'Showing: Local · All city');
  assert.equal(button('Update results').props.disabled,true);
  press('Rare editions');press('Hidden gem');press('2 km');
  assert.equal(requests.length,1,'Draft edits must not fetch');
  assert.ok(JSON.stringify(tree).includes('initial'));
  assert.equal(summary(),'Showing: Local · All city');
  const apply=button('Update results').props.onPress;
  apply();apply();apply();render();
  assert.equal(requests.length,2,'Repeated taps submit once');
  assert.deepEqual(JSON.parse(requests[1].options.body),{place:'Bookstore',searchId:'snapshot',preference:'hidden-gem',distanceKm:2,selectedKeywords:['Rare editions']});
  assert.equal(summary(),'Showing: Local · All city','Summary stays with displayed results while updating');
  assert.ok(JSON.stringify(tree).includes('initial'),'Old cards stay visible while updating');
  press('Closest');press('Update results');
  assert.equal(requests[1].options.signal.aborted,true);
  assert.equal(JSON.parse(requests[2].options.body).preference,'closest');
  press('Popular but worth it'); // Edit draft while the applied request is running.
  assert.equal(requests.length,3);
  await resolve(2,'latest',['Changed wording']);
  await resolve(1,'stale');
  assert.equal(summary(),'Showing: Closest · within 2 km · focused on Rare editions');
  assert.equal(button('Popular but worth it').props['aria-checked'],true,'Response must not overwrite draft');
  const output=JSON.stringify(tree);
  assert.ok(output.includes('latest'));assert.ok(!output.includes('stale'));assert.ok(output.includes('Rare editions'));assert.ok(!output.includes('Changed wording'));
  press('Update results');
  requests[3].resolve(Response.json({success:false,error:'Temporary test failure'},{status:503}));
  await new Promise(setImmediate);render();
  assert.ok(JSON.stringify(tree).includes('latest'));
  assert.equal(summary(),'Showing: Closest · within 2 km · focused on Rare editions');
  assert.equal(button('Update results').props.disabled,false,'Failed request can be retried without changing the draft');
  press('Update results');await resolve(4,'retried');
  assert.equal(summary(),'Showing: Popular but worth it · within 2 km · focused on Rare editions');
  press('Update results');assert.equal(requests.length,5,'Already applied filters must not refetch');
  press('1 km');press('Update results');assert.equal(JSON.parse(requests[5].options.body).distanceKm,1);
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
    const feature = (id, lat=0) => ({properties:{name:id,place_id:id,city:'City',country:'Country'},geometry:{coordinates:[0,lat]}});
    class AI {models = {generateContent: async ({model,contents,config}) => {
      models.push(model);
      assert.ok(config.responseJsonSchema);
      if(model !== 'gemini-3.5-flash-lite') throw Object.assign(new Error('Rate limited'),{status:429});
      if(contents.includes('experience-understanding')) return {text:JSON.stringify({category:'Bookstore',categoryFamily:'books',experienceKeywords:['Rare editions','Reading room']})};
      rankingAttempts++;
      const item={candidateId:'candidate-0',similarityScore:80,localScore:85,distinctivenessScore:80,chainLikelihood:0,popularityScore:20,keywordScores:{'Rare editions':90,'Reading room':60}};
      if(rankingAttempts===1) {
        if(failure==='invalid JSON')return {text:'{"recommendations":['};
        if(failure==='truncated JSON')return {text:JSON.stringify({recommendations:[item]}),candidates:[{finishReason:'MAX_TOKENS'}]};
        if(failure==='missing candidate')return {text:'{"recommendations":[]}'};
        delete item.keywordScores['Rare editions'];
      }
      return {text:JSON.stringify({recommendations:[item]})};
    }}}
    const api=load('src/app/places+api.ts',{'@google/genai':{GoogleGenAI:AI},'../lib/places-ranking':ranking},{fetch:async url=>Response.json({features:url.includes('/v2/places')?[feature('alternative',0.001)]:[feature(url.includes('type=city')?'city':'original')]})});
    const request = body=>new Request('http://localhost/places',{method:'POST',body:JSON.stringify({place:'Bookstore',...body})});
    const response=await api.POST(request({}));
    assert.equal(response.status,200);
    const initial=await response.json();
    assert.equal(initial.recommendations[0].name,'alternative');
    assert.equal(models.filter(model=>model==='gemini-3.8-flash').length,1);
    assert.equal(models.filter(model=>model==='gemini-3.7-flash').length,1);
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
  assert.equal(attempts,6);
  controller.abort();
  const cancelled=geminiJson.createJsonGenerator({models:{generateContent:async()=>{throw Error('Must not run');}}},controller.signal);
  await assert.rejects(cancelled('prompt',{},data=>data),error=>error.name==='AbortError');
});
