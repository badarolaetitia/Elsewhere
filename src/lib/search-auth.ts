import {getSupabase} from './supabase';
export async function searchAuthHeaders():Promise<Record<string,string>> {
  const client=getSupabase();
  if(!client)return {};
  try {
  const {data}=await client.auth.getSession();
  return data.session?.access_token?{Authorization:`Bearer ${data.session.access_token}`} : {};
  }catch{return {};}
}
