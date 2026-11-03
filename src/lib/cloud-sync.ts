import type {SupabaseClient} from '@supabase/supabase-js';
import {readPending,acknowledgePending,applyCloud,currentOwner,type Collection,type Item} from './local-data';
export async function syncAccount(client:SupabaseClient,user:string){
  const {data:{user:verified},error:authError}=await client.auth.getUser();
  if(authError||verified?.id!==user)throw Error('Please sign in again before syncing.');
  const pending=readPending(user);
  for(const item of pending){
    if(currentOwner()!==user)return;
    const result=item.data
      ?await client.from('user_items').upsert({user_id:user,kind:item.kind,item_id:item.id,payload:item.data},{onConflict:'user_id,kind,item_id'})
      :await client.from('user_items').delete().eq('user_id',user).eq('kind',item.kind).eq('item_id',item.id);
    if(result.error)throw Error('Your changes are kept on this device. Cloud sync failed; please retry.');
    acknowledgePending([item],user);
  }
  const {data,error}=await client.from('user_items').select('kind,payload').eq('user_id',user);
  if(error)throw Error('Could not load your cloud data. Please retry.');
  if(currentOwner()!==user)return;
  for(const kind of ['saved','visits','plans'] as Collection[])applyCloud(kind,(data??[]).filter(row=>row.kind===kind).map(row=>row.payload as Item),user);
}
