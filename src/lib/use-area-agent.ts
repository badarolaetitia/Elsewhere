import {useEffect,useState} from 'react';
import {searchAuthHeaders} from './search-auth';
import type {AreaInvestigation} from './area-crowd';

export function useAreaAgent(venueIds:string[],atLocal?:string){
  const key=[...venueIds].sort().join(',');
  const requestKey=`${key}|${atLocal??'now'}`;
  const [state,setState]=useState<{key:string;result:AreaInvestigation|null;loading:boolean;error:string;now:number}>({key:'',result:null,loading:false,error:'',now:Date.now()});
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if(!key){setState({key,result:null,loading:false,error:'',now:Date.now()});return;}
    const controller=new AbortController();
    setState({key:requestKey,result:null,loading:true,error:'',now:Date.now()});
    void (async()=>{
      try{
        const headers=await searchAuthHeaders();
        const response=await fetch('/crowd',{method:'POST',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45_000)]),body:JSON.stringify({place:'West Village',searchId:'area-signals:v1',venueIds:key.split(','),atLocal})});
        const data=await response.json();if(!response.ok||!data.success)throw Error(data.error??'Area research is unavailable.');
        if(!controller.signal.aborted)setState({key:requestKey,result:data.investigation,loading:false,error:'',now:Date.now()});
      }catch(error){if(!controller.signal.aborted)setState({key:requestKey,result:null,loading:false,error:error instanceof Error?error.message:'Area research is unavailable.',now:Date.now()});}
    })();
    return()=>controller.abort();
  },[key,requestKey,atLocal,version]);
  useEffect(()=>{
    const expires=state.result?.expiresAt;
    if(!expires)return;
    const timer=setTimeout(()=>{setState(current=>({...current,result:null,now:Date.now()}));setVersion(v=>v+1);},Math.max(1,expires-Date.now()));
    return()=>clearTimeout(timer);
  },[state.result]);
  return {...state,result:state.key===requestKey?state.result:null,retry:()=>setVersion(v=>v+1)};
}
