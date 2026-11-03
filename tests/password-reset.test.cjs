const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function accountWith(auth){
 const exports={};
 const react={createContext:()=>({Provider:'provider'}),useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}};
 const jsx=(_type,props)=>props;
 const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Platform:{OS:'web'}},'expo-linking':{},'expo-web-browser':{},'@react-native-async-storage/async-storage':{},'../lib/supabase':{getSupabase:()=>({auth})},'../lib/auth-callback':{createAuthCallbackHandler:()=>()=>{}},'../lib/cloud-sync':{},'../lib/local-data':{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/account-provider.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:id=>imports[id],window:{location:{origin:'https://elsewhere.example'}},process:{env:{}},setTimeout,clearTimeout});
 return exports.AccountProvider({children:null}).value;
}
test('password recovery uses the existing allowed account callback without creating a user',async()=>{
 let request;
 const account=accountWith({resetPasswordForEmail:async(...args)=>{request=args;return {error:null};}});
 await account.resetPassword(' tester@example.com ');
 assert.equal(request[0],'tester@example.com');assert.equal(request[1].redirectTo,'https://elsewhere.example/account');
 request=null;await assert.rejects(account.resetPassword('not-an-email'),/valid email/);assert.equal(request,null);
});
test('recovery failures remain actionable and password updates enforce minimum length',async()=>{
 const account=accountWith({resetPasswordForEmail:async()=>({error:Error('provider details')}),updateUser:async()=>({error:Error('expired session')})});
 await assert.rejects(account.resetPassword('tester@example.com'),/try again later or contact/);
 await assert.rejects(account.updatePassword('short'),/12 characters/);
 await assert.rejects(account.updatePassword('long enough password'),/new reset link/);
});
function accountScreen(account){
 const state=[];let cursor=0;const exports={};
 const jsx=(type,props)=>({type,props});
 const imports={react:{useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],value=>{state[index]=value;}];}},'react/jsx-runtime':{jsx,jsxs:jsx},'expo-router':{router:{}},'react-native':{Pressable:'button',ScrollView:'page',Text:'text',TextInput:'input',View:'view'},'../components/account-provider':{useAccount:()=>account},'../lib/supabase':{enabledSocialProviders:[]},'../lib/local-data':{readCollection:()=>[]},'../components/brand':{default:'brand'},'../components/collection-styles':{default:{}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/account.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:id=>imports[id],process:{env:{EXPO_PUBLIC_INVITE_ONLY:'true'}}});
 function nodes(node){if(!node)return [];if(Array.isArray(node))return node.flatMap(nodes);if(typeof node!=='object')return [];return [node,...nodes(node.props?.children)];}
 return ()=>{cursor=0;return nodes(exports.default());};
}
test('account keeps password fields closed until requested, while recovery opens them directly',()=>{
 const render=accountScreen({user:{email:'tester@example.com'},configured:true,recovering:false,error:'',status:'All changes saved'});
 let nodes=render();assert.equal(nodes.some(node=>node.props.accessibilityLabel==='New password'),false);
 const change=nodes.find(node=>node.type==='button'&&node.props.children?.props?.children==='Change password');assert.ok(change);change.props.onPress();
 assert.ok(render().some(node=>node.props.accessibilityLabel==='New password'));
 const recovering=accountScreen({user:{email:'tester@example.com'},configured:true,recovering:true,error:'',status:'All changes saved'});
 assert.ok(recovering().some(node=>node.props.accessibilityLabel==='New password'));
});
