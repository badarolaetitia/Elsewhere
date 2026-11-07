export const WEST_VILLAGE_BOUNDS={north:40.7415,south:40.7280,west:-74.012,east:-73.9965};
export type Point={lat:number;lng:number};
export type Station={id:string;name:string;lat:number;lng:number;typical:Record<string,number>};
export type StreetEvent={id:string;name:string;start:string;end:string;location:string;lat:number;lng:number;approximate:true;sourceUrl:string};
export type SignalSource={kind:'transit'|'events';url:string;fetchedAt:string;status:'available'|'unavailable';dataThrough?:string;count:number;unlocated?:number};
export type AreaSignals={stations:Station[];events:StreetEvent[];sources:SignalSource[];expiresAt:number};
export type AreaReading={label:'lower'|'typical'|'higher'|'insufficient';value:number|null;confidence:'low'|'medium'|'none';because:string[];sources:string[]};
export type VenueArea={id:string;name:string;latitude:number;longitude:number;reading:AreaReading};
export type AreaInvestigation={venues:VenueArea[];heat:HeatCell[];stations:Station[];events:StreetEvent[];sources:SignalSource[];atLocal:string;generatedAt:string;expiresAt:number;activity:{agent:string;message:string}[]};

export function distanceKm(a:Point,b:Point){
  const lat=(b.lat-a.lat)*Math.PI/180,lng=(b.lng-a.lng)*Math.PI/180;
  const n=Math.sin(lat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(lng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(n),Math.sqrt(Math.max(0,1-n)));
}
export function insidePilot(point:Point){const b=WEST_VILLAGE_BOUNDS;return Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&point.lat>=b.south&&point.lat<=b.north&&point.lng>=b.west&&point.lng<=b.east;}
export function newYorkLocal(now:number){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}
export function stationLoad(station:Station,atLocal:string):number|null {
  const day=new Date(`${atLocal.slice(0,10)}T12:00:00Z`).getUTCDay();
  const hour=Number(atLocal.slice(11,13)),current=station.typical[`${day}-${hour}`];
  const peak=Math.max(0,...Object.values(station.typical));
  return peak>0&&Number.isFinite(current)?Math.max(0,Math.min(1,current/peak)):null;
}
export function eventActive(event:StreetEvent,atLocal:string){return event.start<=atLocal&&atLocal<event.end;}

export function areaAt(signals:AreaSignals,point:Point,atLocal:string,now:number):AreaReading {
  const empty:AreaReading={label:'insufficient',value:null,confidence:'none',because:[],sources:[]};
  if(now>=signals.expiresAt||!insidePilot(point))return empty;
  const transit=signals.sources.find(s=>s.kind==='transit'&&s.status==='available');
  const nearest=signals.stations.map(station=>({station,km:distanceKm(point,station),load:stationLoad(station,atLocal)})).filter(s=>s.km<=0.45&&s.load!==null).sort((a,b)=>a.km-b.km)[0];
  const eventSource=signals.sources.find(s=>s.kind==='events'&&s.status==='available');
  const events=eventSource?signals.events.filter(e=>eventActive(e,atLocal)&&distanceKm(point,e)<=0.25):[];
  const because:string[]=[],sources:string[]=[];
  let value:number|null=null;
  if(transit&&nearest){value=nearest.load;because.push(`${nearest.station.name}: ${Math.round(nearest.load!*100)}% of this station’s typical weekly peak for this weekday and hour. Historical entries through ${transit.dataThrough?.slice(0,10)}; not live foot traffic.`);sources.push(transit.url);}
  if(events.length){value=Math.max(value??0,0.7);for(const event of events.slice(0,2)){because.push(`Permitted event nearby: ${event.name}. Location approximate; attendance is not measured.`);sources.push(event.sourceUrl);}}
  if(value===null)return empty;
  return {label:value>=0.66?'higher':value>=0.33?'typical':'lower',value,confidence:'low',because,sources:[...new Set(sources)]};
}

export type HeatCell={lat:number;lng:number;reading:AreaReading};
export function heatGrid(signals:AreaSignals,atLocal:string,now:number):HeatCell[]{
  const b=WEST_VILLAGE_BOUNDS,cells:HeatCell[]=[];
  for(let row=0;row<12;row++)for(let col=0;col<12;col++){
    const lat=b.south+(row+0.5)*(b.north-b.south)/12,lng=b.west+(col+0.5)*(b.east-b.west)/12;
    const reading=areaAt(signals,{lat,lng},atLocal,now);if(reading.value!==null)cells.push({lat,lng,reading});
  }
  return cells;
}
