const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(path,imports={},storage){const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(code,{exports,require:id=>imports[id]??require(id),localStorage:storage,console});return exports;}
function setup(){const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};const local=load('src/lib/local-data.ts',{},storage);return {local,storage};}
const plain=value=>JSON.parse(JSON.stringify(value));
test('guest data is isolated from every account and imports without replacing existing records',()=>{
 const {local}=setup();local.writeCollection('saved',[{id:'same',name:'Guest'},{id:'guest-only',name:'G'}]);
 local.setDataOwner('alice');assert.equal(local.readCollection('saved').length,0);
 local.writeCollection('saved',[{id:'same',name:'Cloud'}]);local.importGuestData();
 assert.deepEqual(plain(local.readCollection('saved')),[{id:'same',name:'Cloud'},{id:'guest-only',name:'G'}]);
 local.setDataOwner('bob');assert.equal(local.readCollection('saved').length,0);assert.equal(local.readPending().length,0);
 local.setDataOwner(null);assert.equal(local.readCollection('saved').length,2);
 local.setDataOwner('alice');local.clearGuestData();assert.equal(local.readCollection('saved','guest').length,0);
});
test('newer edits survive in-flight sync acknowledgement and remote refresh',()=>{
 const {local}=setup();local.setDataOwner('alice');local.writeCollection('visits',[{id:'a',rating:4}]);const sent=local.readPending();
 local.writeCollection('visits',[{id:'a',rating:5}]);local.acknowledgePending(sent,'alice');assert.equal(local.readPending().length,1);
 local.applyCloud('visits',[{id:'a',rating:4}],'alice');assert.equal(local.readCollection('visits')[0].rating,5);
 local.writeCollection('visits',[]);local.applyCloud('visits',[{id:'a',rating:4}],'alice');assert.equal(local.readCollection('visits').length,0);
});
test('sign-out cache cleanup cannot leak or delete another account or guest records',()=>{
 const {local}=setup();local.writeCollection('saved',[{id:'guest'}]);local.setDataOwner('alice');local.writeCollection('saved',[{id:'alice'}]);local.setDataOwner('bob');local.writeCollection('saved',[{id:'bob'}]);
 local.clearAccountCache('alice');assert.equal(local.readCollection('saved')[0].id,'bob');
 local.setDataOwner('alice');assert.equal(local.readCollection('saved').length,0);local.setDataOwner(null);assert.equal(local.readCollection('saved')[0].id,'guest');
});
function clientFor(user,rows=[],fail=false){
 return {rows,auth:{getUser:async()=>({data:{user:{id:user}},error:null})},from:()=>({
  upsert:async row=>{if(fail)return {error:Error('offline')};const i=rows.findIndex(v=>v.user_id===row.user_id&&v.kind===row.kind&&v.item_id===row.item_id);if(i<0)rows.push(row);else rows[i]=row;return {error:null};},
  delete:()=>{const filters={};const query={eq:(key,value)=>{filters[key]=value;return query;},then:resolve=>{if(fail)return resolve({error:Error('offline')});for(let i=rows.length-1;i>=0;i--)if(Object.entries(filters).every(([key,value])=>rows[i][key]===value))rows.splice(i,1);resolve({error:null});}};return query;},
  select:()=>({eq:async(_key,value)=>({data:rows.filter(row=>row.user_id===value),error:fail?Error('offline'):null})})
 })};
}
test('sync uploads only the verified owner, loads remote records and applies deletions',async()=>{
 const {local}=setup();local.setDataOwner('alice');local.writeCollection('saved',[{id:'a',name:'Saved'}]);
 const client=clientFor('alice',[{user_id:'bob',kind:'saved',item_id:'b',payload:{id:'b'}}]);
 const sync=load('src/lib/cloud-sync.ts',{'./local-data':local}).syncAccount;
 await sync(client,'alice');assert.equal(local.readPending().length,0);assert.equal(local.readCollection('saved').length,1);
 local.writeCollection('saved',[]);await sync(client,'alice');assert.equal(client.rows.length,1);assert.equal(client.rows[0].user_id,'bob');
 await assert.rejects(sync(client,'bob'),/sign in again/);
});
test('failed sync preserves pending edits for a retry',async()=>{
 const {local}=setup();local.setDataOwner('alice');local.writeCollection('plans',[{id:'plan'}]);
 const sync=load('src/lib/cloud-sync.ts',{'./local-data':local}).syncAccount;
 await assert.rejects(sync(clientFor('alice',[],true),'alice'),/kept on this device/);
 assert.equal(local.readPending().length,1);assert.equal(local.readCollection('plans')[0].id,'plan');
 await sync(clientFor('alice'),'alice');assert.equal(local.readPending().length,0);
});
test('migration enables owner-only RLS and self-only account deletion',()=>{
 const sql=fs.readFileSync('supabase/migrations/202611020001_private_items.sql','utf8');
 assert.match(sql,/enable row level security/);assert.equal((sql.match(/create policy/g)||[]).length,4);
 assert.match(sql,/delete from auth.users where id=auth.uid\(\)/);assert.match(sql,/revoke all on function public.delete_my_account\(\) from public,anon/);
});


test('web callback is handled exclusively by the SDK, not replayed by native linking',async()=>{
 const {createAuthCallbackHandler}=load('src/lib/auth-callback.ts');let calls=0;
 const handle=createAuthCallbackHandler({platform:'web',parse:()=>({path:'account',queryParams:{code:'one-use-code'}}),exchange:async()=>{calls++;return {error:Error('already used')};}});
 await handle('callback');assert.equal(calls,0);
});
test('native callback events and browser completion exchange a one-use code only once',async()=>{
 const {createAuthCallbackHandler}=load('src/lib/auth-callback.ts');let calls=0;let finish;
 const handle=createAuthCallbackHandler({platform:'ios',parse:()=>({hostname:'account',queryParams:{code:'one-use-code'}}),exchange:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const first=handle('callback');const duplicate=handle('callback');assert.equal(calls,1);
 finish({error:null});await Promise.all([first,duplicate]);await handle('callback');assert.equal(calls,1);
});
test('an invalid native callback remains an actionable error and can be retried',async()=>{
 const {createAuthCallbackHandler}=load('src/lib/auth-callback.ts');let calls=0;
 const handle=createAuthCallbackHandler({platform:'android',parse:()=>({path:'account',queryParams:{code:'expired'}}),exchange:async()=>({error:++calls===1?Error('expired'):null})});
 await assert.rejects(handle('callback'),/invalid or expired/);await handle('callback');assert.equal(calls,2);
});


test('removing a stale saved-place card never adds the place back',()=>{
 const {local,storage}=setup();const profile=load('src/lib/taste-profile.ts',{'./local-data':local},storage);
 profile.toggleSavedPlace({id:'a',name:'A',address:'City',interests:[]});
 profile.removeSavedPlace('a');profile.removeSavedPlace('a');
 assert.equal(profile.readSavedPlaces().length,0);
});
