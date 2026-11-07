import {checkedVenues} from '../lib/pilot-catalog';
import {cachedAreaSignals} from '../lib/crowd-agent-tools';
import {investigateArea,requestedLocalTime} from '../lib/area-crowd-agent';

export async function POST(request:Request){
  try{
    const text=await request.text();if(text.length>10_000)return Response.json({success:false,error:'Request too large.'},{status:413});
    const body=JSON.parse(text),ids=body?.venueIds;
    if(!Array.isArray(ids)||ids.length>checkedVenues.length||!ids.length||ids.some(id=>typeof id!=='string'||!checkedVenues.some(v=>v.id===id)))return Response.json({success:false,error:'Choose checked West Village venues.'},{status:400});
    const now=Date.now();let atLocal:string;
    try{atLocal=requestedLocalTime(body.atLocal,now);}catch{return Response.json({success:false,error:'Choose a valid New York date and time within the next seven days.'},{status:400});}
    const signals=await cachedAreaSignals(now);
    return Response.json({success:true,investigation:investigateArea([...new Set(ids)],signals,atLocal,now)},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({success:false,error:'Area research is unavailable. Your experience matches are unchanged.'},{status:400});}
}
