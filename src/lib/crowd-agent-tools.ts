import {insidePilot,newYorkLocal,distanceKm,type AreaSignals,type Station,type StreetEvent,type SignalSource} from './area-crowd';

export const MTA_URL='https://data.ny.gov/resource/5wq4-mkjj.json';
export const EVENTS_URL='https://data.cityofnewyork.us/resource/tvpp-9vvx.json';
const MTA_PAGE='https://data.ny.gov/Transportation/MTA-Subway-Hourly-Ridership-Beginning-2025/5wq4-mkjj';
const EVENTS_PAGE='https://data.cityofnewyork.us/City-Government/NYC-Permitted-Event-Information/tvpp-9vvx';
const CENTER={lat:40.7347,lng:-74.0035};
const query=(base:string,params:Record<string,string>)=>`${base}?${new URLSearchParams(params)}`;
type Get=(url:string)=>Promise<any>;
const getJson=async (url:string,deadline:AbortSignal)=>{
  for(let attempt=0;attempt<2;attempt++){
    const response=await fetch(url,{signal:AbortSignal.any([deadline,AbortSignal.timeout(18_000)]),headers:{Accept:'application/json'}});
    if(!response.ok){if(attempt===0&&[502,503,504].includes(response.status)){await response.body?.cancel();continue;}throw Error('Public source unavailable');}
    const text=await response.text();if(text.length>1_000_000)throw Error('Source response too large');
    return JSON.parse(text);
  }
  throw Error('Public source unavailable');
};

export function toStations(rows:any[]):Station[]{
  const stations=new Map<string,Station>();
  for(const r of rows){
    const lat=Number(r.latitude),lng=Number(r.longitude),samples=Number(r.samples),riders=Number(r.riders),dow=Number(r.dow),hour=Number(r.hour);
    if(!r.station_complex_id||typeof r.station_complex!=='string'||!Number.isFinite(lat)||!Number.isFinite(lng)||distanceKm(CENTER,{lat,lng})>1.2||!Number.isInteger(samples)||samples<3||!Number.isFinite(riders)||riders<0||!Number.isInteger(dow)||dow<0||dow>6||!Number.isInteger(hour)||hour<0||hour>23)continue;
    const station:Station=stations.get(r.station_complex_id)??{id:String(r.station_complex_id),name:r.station_complex.slice(0,120),lat,lng,typical:{}};
    station.typical[`${dow}-${hour}`]=riders/samples;stations.set(r.station_complex_id,station);
  }
  return [...stations.values()].filter(s=>Object.keys(s.typical).length>=24);
}

async function transitTool(now:number,get:Get){
  const source:SignalSource={kind:'transit',url:MTA_PAGE,fetchedAt:new Date(now).toISOString(),status:'unavailable',count:0};
  try{
    const latest=await get(query(MTA_URL,{$select:'max(transit_timestamp) as latest',$where:'within_circle(georeference,40.7347,-74.0035,1100)'}));
    const through=latest[0]?.latest;
    if(typeof through!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(through))throw Error('Missing timestamp');
    const stamp=Date.parse(`${through}Z`);if(!Number.isFinite(stamp)||now-stamp>45*86400_000||stamp>now+86400_000)throw Error('Stale history');
    const since=new Date(stamp-56*86400_000).toISOString().slice(0,19);
    const rows=await get(query(MTA_URL,{
      $select:'station_complex_id,station_complex,latitude,longitude,date_extract_dow(transit_timestamp) as dow,date_extract_hh(transit_timestamp) as hour,sum(ridership) as riders,count(distinct transit_timestamp) as samples',
      $where:`transit_timestamp >= '${since}' AND transit_timestamp <= '${through}' AND within_circle(georeference,40.7347,-74.0035,1100)`,
      $group:'station_complex_id,station_complex,latitude,longitude,dow,hour',$order:'station_complex_id,dow,hour',$limit:'3000',
    }));
    if(!Array.isArray(rows)||rows.length>=3000)throw Error('Incomplete station data');
    const stations=toStations(rows);
    return {stations,source:{...source,status:stations.length?'available' as const:'unavailable' as const,dataThrough:through,count:stations.length}};
  }catch{return {stations:[],source};}
}

async function eventTool(now:number,get:Get){
  const source:SignalSource={kind:'events',url:EVENTS_PAGE,fetchedAt:new Date(now).toISOString(),status:'unavailable',count:0};
  try{
    const from=newYorkLocal(now).slice(0,10)+'T00:00:00',to=newYorkLocal(now+7*86400_000).slice(0,10)+'T23:59:59';
    const rows=await get(query(EVENTS_URL,{$where:`event_borough = 'Manhattan' AND (community_board = '2' OR community_board like '2,%' OR community_board like '%,2,%' OR community_board like '%,2') AND start_date_time <= '${to}' AND end_date_time >= '${from}'`,$order:'start_date_time,event_id',$limit:'1000'}));
    if(!Array.isArray(rows)||rows.length>=1000)throw Error('Incomplete events');
    const nearby=rows.filter(r=>String(r.community_board??'').split(',').map(s=>s.trim()).includes('2'));
    const events:StreetEvent[]=[];
    const locations=new Map<string,any>();let attempted=0,unlocated=0;
    for(const r of nearby){
      if(typeof r.event_location!=='string'||typeof r.event_name!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(r.start_date_time)||!/^\d{4}-\d{2}-\d{2}T/.test(r.end_date_time)){unlocated++;continue;}
      const location=r.event_location.slice(0,240);
      if(!locations.has(location)){
        if(attempted>=4){unlocated++;continue;}attempted++;
        try{const geo=await get(query('https://geosearch.planninglabs.nyc/v2/search',{text:`${location}, Manhattan, New York`,size:'1'}));locations.set(location,geo.features?.[0]??null);}catch{locations.set(location,null);}
      }
      const feature=locations.get(location),coords=feature?.geometry?.coordinates,p=feature?.properties;
      if(!Array.isArray(coords)||p?.borough!=='Manhattan'||!['venue','address'].includes(p?.layer)||Number(p?.confidence)<0.8||!Number.isFinite(p?.confidence)||!insidePilot({lat:coords[1],lng:coords[0]})){unlocated++;continue;}
      const event={id:String(r.event_id),name:r.event_name.slice(0,160),start:r.start_date_time.slice(0,19),end:r.end_date_time.slice(0,19),location,lat:coords[1],lng:coords[0],approximate:true as const,sourceUrl:EVENTS_PAGE};
      if(event.start<event.end&&!events.some(e=>e.id===event.id))events.push(event);
    }
    return {events,source:{...source,status:'available' as const,count:events.length,unlocated}};
  }catch{return {events:[],source};}
}

export async function collectAreaSignals(now=Date.now(),get?:Get):Promise<AreaSignals>{
  const deadline=AbortSignal.timeout(30_000),read=get??((url:string)=>getJson(url,deadline));
  const [transit,events]=await Promise.all([transitTool(now,read),eventTool(now,read)]);
  return {stations:transit.stations,events:events.events,sources:[transit.source,events.source],expiresAt:now+15*60_000};
}

let cached:AreaSignals|undefined,inFlight:Promise<AreaSignals>|undefined;
export async function cachedAreaSignals(now=Date.now()):Promise<AreaSignals>{
  if(cached&&now<cached.expiresAt)return cached;
  if(inFlight)return inFlight;
  inFlight=collectAreaSignals(now).then(value=>{cached=value;return value;}).finally(()=>{inFlight=undefined;});
  return inFlight;
}
