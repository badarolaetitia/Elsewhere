// Requires the actual Expo server to be running: npm run web
// Optional: ELSEWHERE_BASE_URL=http://localhost:8082 npm run test:live
const assert = require('node:assert/strict');
const baseURL = process.env.ELSEWHERE_BASE_URL || 'http://localhost:8086';
const queries = process.argv.slice(2);
async function post(place, filters = {}) {
  const response = await fetch(new URL('/places', baseURL), {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({place,...filters}), signal:AbortSignal.timeout(240_000),
  });
  const data=await response.json();
  assert.equal(response.status,200,`/places returned ${response.status}: ${data.error}`);
  assert.equal(data.success,true);
  return data;
}
(async()=>{
  for(const place of queries.length ? queries : ['Magnolia Bakery','Via Carota']) {
    const start=Date.now();
    const initial=await post(place);
    assert.ok(initial.recommendations.length,'Expected recommendations');
    assert.ok(initial.searchId,'Expected dataset version');
    console.log(JSON.stringify({place,seconds:Math.round((Date.now()-start)/1000),count:initial.candidateCount,researchStatus:initial.researchStatus,top:initial.recommendations[0].name}));
    const keyword=initial.classification.experienceKeywords[0];
    for(const filter of [{selectedKeywords:[keyword]},{preference:'local'},{preference:'hidden-gem'},{preference:'popular-worth-it'},{preference:'closest'},{distanceKm:'all'},{distanceKm:1},{distanceKm:2},{distanceKm:5}]) {
      const data=await post(place,{searchId:initial.searchId,...filter});
      assert.deepEqual(data.classification,initial.classification);
      assert.equal(data.searchId,initial.searchId);
      if(filter.selectedKeywords) {
        assert.deepEqual(data.selectedKeywords,[keyword]);
        for(const item of data.recommendations) assert.equal(item.focusMatchScore,item.keywordScores[keyword]);
      }
      if(typeof filter.distanceKm==='number') assert.ok(data.recommendations.every(item=>item.distance!==null && item.distance<=filter.distanceKm));
      assert.ok(data.recommendations.every(item=>item.placeId!==initial.searchedPlace.placeId));
      console.log(JSON.stringify({filter,count:data.recommendations.length,top:data.recommendations[0]?.name}));
    }
    assert.deepEqual((await post(place,{searchId:initial.searchId})).recommendations,initial.recommendations);
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
