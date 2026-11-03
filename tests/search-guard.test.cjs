const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE search_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
 const DB={prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values)},async run(){return sqlite.prepare(sql).run(...values)}}}}}};
 const exports={};let authCalls=0;let rejectUser=false;
 const code=ts.transpileModule(fs.readFileSync('hosting/search-guard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports,require,Response,AbortSignal,TextEncoder,Uint8Array,crypto:require('node:crypto').webcrypto,fetch:async(_url,options)=>{authCalls++;if(rejectUser)return Response.json({},{status:401});return Response.json({id:options.headers.Authorization.slice(7),email:'tester@example.com',email_confirmed_at:'2026-01-01'});}});
 const env={DB,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SEARCH_LIMIT_SECRET:'test-secret',BETA_TESTER_EMAILS:'tester@example.com'};
 const request=(body={},ip='1.2.3.4',token='tester')=>new Request('https://elsewhere.example/places',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,Authorization:`Bearer ${token}`},body:JSON.stringify({place:'A venue',...body})});
 return {guard:exports.guardSearch,env,request,sqlite,get authCalls(){return authCalls},set rejectUser(value){rejectUser=value}};
}
test('search accepts guests and rejects malformed requests and invalid supplied sessions',async()=>{
 const s=setup();const now=1_800_000_000_000;
 const guest=s.request();guest.headers.delete('Authorization');assert.equal(await s.guard(guest,s.env,now),null);assert.equal(s.authCalls,0);
 assert.equal(await s.guard(s.request(),{...s.env,BETA_TESTER_EMAILS:'other@example.com'},now),null);
 assert.equal((await s.guard(s.request({place:''}),s.env,now)).status,400);
 s.rejectUser=true;assert.equal((await s.guard(s.request(),s.env,now)).status,401);
 assert.equal((await s.guard(s.request(),{...s.env,DB:undefined},now)).status,503);
});
test('IP request limits are enforced before auth lookups and do not store raw IP addresses',async()=>{
 const s=setup();const now=1_800_000_000_000;
 for(let i=0;i<6;i++)assert.equal(await s.guard(s.request({searchId:'signed-snapshot'}),s.env,now),null);
 const blocked=await s.guard(s.request({searchId:'signed-snapshot'}),s.env,now);assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');assert.equal(s.authCalls,6);
 assert.ok(!JSON.stringify(s.sqlite.prepare('SELECT * FROM search_limits').all()).includes('1.2.3.4'));
});
test('global daily quota is atomic across visitors and reranking does not consume provider allowance',async()=>{
 const s=setup();const now=1_800_000_000_000;
 for(let i=0;i<50;i++)assert.equal(await s.guard(s.request({},`10.0.0.${i}`,`user-${i}`),s.env,now),null);
 assert.equal((await s.guard(s.request({},'10.1.0.1','new-user'),s.env,now)).status,429);
 assert.equal(await s.guard(s.request({searchId:'snapshot'},'10.1.0.2','another-user'),s.env,now),null);
 assert.equal((await s.guard(s.request({searchId:''},'10.1.0.3','another-user-2'),s.env,now)).status,429);
 assert.equal(s.sqlite.prepare("SELECT count FROM search_limits WHERE bucket LIKE 'all:%'").get().count,50);
});
test('a single tester cannot consume the whole daily provider allowance',async()=>{
 const s=setup();const now=1_800_000_000_000;
 for(let i=0;i<20;i++)assert.equal(await s.guard(s.request({},`10.0.0.${i}`),s.env,now),null);
 assert.equal((await s.guard(s.request({},'10.0.1.1'),s.env,now)).status,429);
});

test('guest daily allowance stays bounded without requiring Supabase or an invite list',async()=>{
 const s=setup();const now=1_800_000_000_000;
 const env={DB:s.env.DB,SEARCH_LIMIT_SECRET:s.env.SEARCH_LIMIT_SECRET};
 for(let i=0;i<10;i++){const req=s.request();req.headers.delete('Authorization');assert.equal(await s.guard(req,env,now+i*60_000),null);}
 const req=s.request();req.headers.delete('Authorization');assert.equal((await s.guard(req,env,now+11*60_000)).status,429);assert.equal(s.authCalls,0);
});
