// Start Expo on 8081 and an isolated Chrome with --remote-debugging-port=9223.
// This uses real /places HTTP responses; the race test only delays delivery to React.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const port = process.argv[2] || '8081';
let socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const target = await (await fetch('http://localhost:9223/json/new?about:blank', {method:'PUT'})).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.reject(message.error) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, {resolve, reject});
    socket.send(JSON.stringify({id:requestId, method, params}));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  async function waitFor(expression, description, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error(`Timed out: ${description}`);
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`
    window.__placesRequests = [];
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (new URL(typeof input === 'string' ? input : input.url, location.href).pathname !== '/places') return nativeFetch(input, init);
      const delay = window.__delayNextPlaces || 0;
      window.__delayNextPlaces = 0;
      const record = {body:JSON.parse(init.body), delivered:false};
      window.__placesRequests.push(record);
      const response = await nativeFetch(input, delay ? {...init, signal:undefined} : init);
      record.data = await response.clone().json();
      record.status = response.status;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      record.delivered = true;
      return response;
    };
  `});
  const count = () => evaluate('window.__placesRequests.length');
  const cards = () => evaluate(`Array.from(document.querySelectorAll('[data-testid="recommendation-card"]')).map(el=>el.innerText)`);
  const summary = () => evaluate(`document.querySelector('[data-testid="applied-filter-summary"]')?.textContent`);
  const chipLabels = () => evaluate(`Array.from(document.querySelectorAll('[role="checkbox"]')).map(el=>el.textContent.replace(/^✓\\s*/,''))`);
  const click = async (label, times = 1) => {
    await evaluate(`(()=>{
      const el=Array.from(document.querySelectorAll('[tabindex], [role="button"]')).find(el=>el.getAttribute('aria-label')===${JSON.stringify(label)} || el.textContent.replace(/^✓\\s*/,'')===${JSON.stringify(label)});
      if(!el)throw Error('Missing control: '+${JSON.stringify(label)});
      for(let i=0;i<${times};i++)el.click();
    })()`);
    await pause(80);
  };
  const selected = label => evaluate(`Array.from(document.querySelectorAll('[aria-checked="true"]')).some(el=>el.getAttribute('aria-label')===${JSON.stringify(label)} || el.textContent.replace(/^✓\\s*/,'')===${JSON.stringify(label)})`);
  async function completed(index) {
    await waitFor(`window.__placesRequests[${index}]?.delivered`, `request ${index} completes`, 240000);
    const request = await evaluate(`window.__placesRequests[${index}]`);
    assert.equal(request.status, 200, request.data?.error);
    assert.equal(request.data.success, true);
    return request;
  }
  async function apply(initial, expected, presses = 1) {
    const before = await count();
    await click('Update results', presses);
    const request = await completed(before);
    await waitFor(`!document.querySelector('[data-testid="updating-results"]')`, 'results finish updating');
    assert.equal(await count(), before + 1, 'Only one request per update');
    assert.equal(request.body.searchId, initial.searchId);
    assert.equal(request.data.searchId, initial.searchId);
    assert.deepEqual(request.data.classification, initial.classification);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(request.body[key], value);
    assert.deepEqual(await chipLabels(), initial.classification.experienceKeywords);
    if (typeof request.body.distanceKm === 'number') assert.ok(request.data.recommendations.every(item => item.distance !== null && item.distance <= request.body.distanceKm));
    return request.data;
  }
  async function search(place) {
    await send('Page.navigate', {url:`http://localhost:${port}/`});
    await waitFor(`(()=>{const input=document.querySelector('input');return Boolean(input)&&Object.keys(input).some(key=>key.startsWith('__reactFiber'));})()`, 'hydrated home search input', 60000);
    await evaluate(`(()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(place)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await pause(100);
    await click('Find alternatives');
    console.log(JSON.stringify({place,stage:'search submitted'}));
    const first = await completed(0);
    await waitFor(`Boolean(document.querySelector('[data-testid="recommendation-card"]'))`, 'recommendation cards render');
    assert.equal(first.body.preference,'local');
    assert.equal(first.body.distanceKm,'all');
    assert.deepEqual(first.body.selectedKeywords,[]);
    assert.equal(await selected('Local'),true);
    assert.equal(await selected('All city'),true);
    assert.equal(await evaluate(`document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length`),0);
    assert.equal(await summary(),'Showing: Local · All city');
    assert.equal(await evaluate(`(()=>{const controls=document.querySelector('[data-testid="filter-controls"]');const cards=document.querySelector('[data-testid="recommendation-card"]');return Boolean(controls.compareDocumentPosition(cards)&Node.DOCUMENT_POSITION_FOLLOWING) && controls.contains(document.querySelector('[role="checkbox"]')) && controls.contains(document.querySelector('[data-testid="update-results"]'));})()`),true);
    return first.data;
  }

  for (const [place, label] of [['Cédric Grolet Opéra','A/B'],['Shakespeare and Company, Paris','C']]) {
    const initial = await search(place);
    const keyword = label === 'A/B'
      ? initial.classification.experienceKeywords.find(item=>/trompe/i.test(item))
      : initial.classification.experienceKeywords[0];
    assert.ok(keyword, `Expected a dynamic experience chip for ${place}`);
    const before = await cards();
    const requestsBefore = await count();
    await click(keyword); await click('Hidden gem'); await click('2 km');
    await pause(500);
    assert.equal(await count(),requestsBefore,'Draft changes must not call /places');
    assert.deepEqual(await cards(),before,'Draft changes must leave recommendation cards unchanged');
    assert.equal(await summary(),'Showing: Local · All city');
    for (const choice of [keyword,'Hidden gem','2 km']) assert.equal(await selected(choice),true);
    const narrowed = await apply(initial, {selectedKeywords:[keyword],preference:'hidden-gem',distanceKm:2}, 5);
    assert.equal(await summary(),`Showing: Hidden gem · within 2 km · focused on ${keyword}`);
    for (const choice of [keyword,'Hidden gem','2 km']) assert.equal(await selected(choice),true);
    const rankingSignature = data=>data.recommendations.map(item=>[item.placeId,item.elsewhereScore]);
    assert.notDeepEqual(rankingSignature(narrowed),rankingSignature(initial),'Applied filters must change ranking scores/order');
    console.log(JSON.stringify({test:label==='A/B'?'A':'C: draft/apply',result:'PASS',place,keyword,checked:narrowed.candidateCount,returned:narrowed.recommendations.length}));

    const narrowCards = await cards();
    await click('All city'); await click('Local');
    assert.deepEqual(await cards(),narrowCards);
    const wider = await apply(initial,{selectedKeywords:[keyword],preference:'local',distanceKm:'all'});
    assert.equal(wider.distanceKm,null);
    assert.equal(wider.candidateCount,initial.candidateCount);
    assert.ok(wider.candidateCount>=narrowed.candidateCount);
    assert.equal(await summary(),`Showing: Local · All city · focused on ${keyword}`);
    console.log(JSON.stringify({test:label==='A/B'?'B':'C: restore All city',result:'PASS',within2km:narrowed.candidateCount,allCity:wider.candidateCount}));

    const beforeRapid = await count();
    await click(keyword,6); // Even number of toggles retains selection; no requests.
    await click('Closest'); await click('Hidden gem'); await click('Popular but worth it');
    assert.equal(await count(),beforeRapid);
    assert.equal(await selected(keyword),true);
    await apply(initial,{selectedKeywords:[keyword],preference:'popular-worth-it',distanceKm:'all'},8);
    const afterApply = await count();
    await click('Update results',8); await pause(200);
    assert.equal(await count(),afterApply,'Already applied filters must not request again');

    // Keep a real older response in flight, then submit a newer selection.
    await click('Hidden gem'); await click('1 km');
    const olderIndex = await count();
    await evaluate('window.__delayNextPlaces=2000');
    await click('Update results',6);
    await waitFor(`Boolean(window.__placesRequests[${olderIndex}]?.data)`, 'older API response received');
    await click('Closest'); await click('2 km');
    const newerIndex = await count();
    await click('Update results',6);
    await completed(newerIndex);
    await waitFor(`!document.querySelector('[data-testid="updating-results"]')`, 'newer results render');
    const newerCards = await cards();
    const newerSummary = await summary();
    await completed(olderIndex); await pause(150);
    assert.deepEqual(await cards(),newerCards,'Delayed stale response cannot replace newer cards');
    assert.equal(await summary(),newerSummary);
    assert.equal(newerSummary,`Showing: Closest · within 2 km · focused on ${keyword}`);

    // A user can continue drafting while an applied request completes.
    await click('Local'); const inFlight = await count();
    await evaluate('window.__delayNextPlaces=700'); await click('Update results');
    await click('Hidden gem');
    await completed(inFlight); await pause(150);
    assert.equal(await selected('Hidden gem'),true,'Response must not overwrite draft selection');
    assert.equal(await summary(),`Showing: Local · within 2 km · focused on ${keyword}`);
    console.log(JSON.stringify({test:`${label}: rapid clicks, repeated updates, out-of-order responses, draft during request`,result:'PASS'}));
    const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(`/private/tmp/elsewhere-draft-${label==='A/B'?'pastry':'books'}.png`,Buffer.from(image.data,'base64'));
  }
  socket.close();
})().catch(error=>{socket?.close();console.error(error);process.exitCode=1;});
