import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:SupabaseClient|null=null;
export function getSupabase(){
  const url=process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key||(Platform.OS==='web'&&typeof window==='undefined'))return null;
  if(!client)client=createClient(url,key,{auth:{storage:AsyncStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:Platform.OS==='web',flowType:'pkce'}});
  return client;
}
export const enabledSocialProviders=(process.env.EXPO_PUBLIC_AUTH_PROVIDERS??'').split(',').filter((value):value is 'google'|'apple'=>value==='google'||value==='apple');
