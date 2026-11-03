import {createAuthCallbackHandler} from '../lib/auth-callback';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AppState,Platform,View,Text,ActivityIndicator} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {User} from '@supabase/supabase-js';
import {getSupabase} from '../lib/supabase';
import {syncAccount} from '../lib/cloud-sync';
import {storageKey,refreshData,currentOwner,setDataOwner,subscribeData,readPending,importGuestData,clearGuestData,clearAccountCache,configurePersistence,hydrateLocalData} from '../lib/local-data';

type Account={recovering:boolean;resetPassword:(email:string)=>Promise<void>;dataVersion:number;user:User|null;ready:boolean;configured:boolean;status:string;error:string;sync:()=>Promise<void>;sendLink:(email:string)=>Promise<void>;signInPassword:(email:string,password:string)=>Promise<void>;updatePassword:(password:string)=>Promise<void>;verifyCode:(email:string,token:string)=>Promise<void>;social:(provider:'google'|'apple')=>Promise<void>;signOut:(discard?:boolean)=>Promise<void>;importGuest:()=>Promise<void>;deleteAccount:()=>Promise<void>};
const Context=createContext<Account|null>(null);
export function useAccount(){const value=useContext(Context);if(!value)throw Error('Account provider is missing.');return value;}
export function AccountProvider({children}:{children:ReactNode}){
  const [recovering,setRecovering]=useState(false);
  const [dataVersion,setDataVersion]=useState(0);
  const [user,setUser]=useState<User|null>(null);
  const [ready,setReady]=useState(false);
  const [configured,setConfigured]=useState(false);
  const [status,setStatus]=useState('Saved on this device');
  const [error,setError]=useState('');
  const running=useRef<Promise<void>|null>(null);
  const runningOwner=useRef<string|null>(null);
  async function sync(){
    const client=getSupabase();const owner=currentOwner();if(!client||owner==='guest')return;
    if(running.current){const sameOwner=runningOwner.current===owner;try{await running.current;}catch(error){if(sameOwner)throw error;}if(currentOwner()!==owner)return;if(!sameOwner||readPending(owner).length)return sync();return;}
    setStatus('Syncing…');setError('');
    const task=syncAccount(client,owner).then(()=>{if(currentOwner()===owner)setStatus(readPending(owner).length?'Saving…':'All changes saved');}).catch(err=>{if(currentOwner()===owner){setError(err instanceof Error?err.message:'Sync failed.');setStatus('Not synced · retry in Account');}throw err;}).finally(()=>{if(running.current===task){running.current=null;runningOwner.current=null;}});
    runningOwner.current=owner;running.current=task;await task;
  }
  const linkHandler=useRef<ReturnType<typeof createAuthCallbackHandler>|null>(null);
  if(!linkHandler.current)linkHandler.current=createAuthCallbackHandler({platform:Platform.OS,parse:Linking.parse,exchange:code=>getSupabase()!.auth.exchangeCodeForSession(code)});
  async function finishLink(url:string){await linkHandler.current!(url);}

  useEffect(()=>{
    let alive=true;let lastId:string|null|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
    const client=getSupabase();setConfigured(Boolean(client));
    async function sessionChanged(next:User|null){if(!alive||(lastId!==undefined&&lastId===(next?.id??null)))return;lastId=next?.id??null;setReady(false);setDataOwner(next?.id??null);setUser(next);setError('');if(next){try{await sync();}catch{}}else setStatus('Saved on this device');if(alive)setReady(true);}
    async function init(){
      if(Platform.OS!=='web'){
        const keys=(await AsyncStorage.getAllKeys()).filter(key=>key.startsWith('elsewhere.'));
        hydrateLocalData(await Promise.all(keys.map(async key=>[key,await AsyncStorage.getItem(key)] as const)));
        configurePersistence((key,value)=>{void AsyncStorage.setItem(key,value);});
      }
      if(!client){if(alive)setReady(true);return;}
      const {data,error}=await client.auth.getSession();if(error)setError('Could not restore your session. Please sign in again.');await sessionChanged(data.session?.user??null);
      if(Platform.OS!=='web'){const initial=await Linking.getInitialURL();if(initial)await finishLink(initial);}
    }
    void init().catch(()=>{if(alive){setError('Could not load your account. Please retry.');setReady(true);}});
    const auth=client?.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')setRecovering(true);if(event==='SIGNED_OUT')setRecovering(false);setTimeout(()=>{void sessionChanged(session?.user??null);},0);});
    const unsubscribe=subscribeData(()=>{setDataVersion(value=>value+1);if(!client||currentOwner()==='guest'||!readPending().length)return;setStatus('Saving…');clearTimeout(timer);timer=setTimeout(()=>{void sync().catch(()=>{});},400);});
    const links=Platform.OS==='web'?null:Linking.addEventListener('url',event=>{void finishLink(event.url).catch(()=>setError('Sign-in link failed. Please request another.'));});
    const storageChanged=(event:StorageEvent)=>{if((['saved','visits','plans'] as const).some(kind=>event.key===storageKey(kind)))refreshData();};
    if(Platform.OS==='web')window.addEventListener('storage',storageChanged);
    const app=AppState.addEventListener('change',state=>{if(!client)return;if(state==='active'){client.auth.startAutoRefresh();void sync().catch(()=>{});}else client.auth.stopAutoRefresh();});
    return()=>{alive=false;clearTimeout(timer);auth?.data.subscription.unsubscribe();unsubscribe();links?.remove();app.remove();if(Platform.OS==='web')window.removeEventListener('storage',storageChanged);};
  },[]);
  function requireClient(){const client=getSupabase();if(!client)throw Error('Accounts are not available on this preview yet.');return client;}
  function redirect(){return Platform.OS==='web'?`${window.location.origin}/account`:Linking.createURL('account');}
  async function sendLink(email:string){const {error}=await requireClient().auth.signInWithOtp({email,options:{emailRedirectTo:redirect(),...(process.env.EXPO_PUBLIC_INVITE_ONLY==='true'?{shouldCreateUser:false}:{})}});if(error)throw Error('Could not send a sign-in email. Please try again later.');}
  async function resetPassword(email:string){if(!/^\S+@\S+\.\S+$/.test(email.trim()))throw Error('Enter a valid email address.');const {error}=await requireClient().auth.resetPasswordForEmail(email.trim(),{redirectTo:redirect()});if(error)throw Error('Could not send a reset email. Please try again later or contact the person who invited you.');}
  async function signInPassword(email:string,password:string){const {error}=await requireClient().auth.signInWithPassword({email,password});if(error)throw Error('Could not sign in. Check your email and password, or ask the person who invited you.');}
  async function updatePassword(password:string){if(password.length<12)throw Error('Use at least 12 characters.');const {error}=await requireClient().auth.updateUser({password});if(error)throw Error('Could not update your password. Please request a new reset link and retry.');setRecovering(false);}
  async function verifyCode(email:string,token:string){const {error}=await requireClient().auth.verifyOtp({email,token,type:'email'});if(error)throw Error('That code is invalid or expired. Please request a new one.');}
  async function social(provider:'google'|'apple'){const {data,error}=await requireClient().auth.signInWithOAuth({provider,options:{redirectTo:redirect(),skipBrowserRedirect:Platform.OS!=='web'}});if(error||!data.url)throw Error('Sign-in is unavailable. Please try email instead.');if(Platform.OS!=='web'){const result=await WebBrowser.openAuthSessionAsync(data.url,redirect());if(result.type==='success')await finishLink(result.url);}}
  async function signOut(discard=false){const client=requireClient();const owner=currentOwner();if(!discard)await sync();const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Could not sign out. Please retry.');clearAccountCache(owner);setDataOwner(null);setUser(null);}
  async function importGuest(){await sync();importGuestData();await sync();clearGuestData();}
  async function deleteAccount(){const client=requireClient();const owner=currentOwner();const {error}=await client.rpc('delete_my_account');if(error)throw Error('Could not delete your account. Please retry.');await client.auth.signOut({scope:'local'});clearAccountCache(owner);setDataOwner(null);setUser(null);}
  return <Context.Provider value={{recovering,resetPassword,dataVersion,user,ready,configured,status,error,sync,sendLink,signInPassword,updatePassword,verifyCode,social,signOut,importGuest,deleteAccount}}>{ready?<>{children}</>:<View style={{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#F8F5EB",gap:12}}><ActivityIndicator/><Text>Opening Elsewhere…</Text></View>}</Context.Provider>;
}
