import {checkedVenues} from './pilot-catalog';
import {areaAt,heatGrid,newYorkLocal,type AreaInvestigation,type AreaSignals} from './area-crowd';

export function investigateArea(ids:string[],signals:AreaSignals,atLocal:string,now:number):AreaInvestigation{
  const venues=checkedVenues.filter(v=>ids.includes(v.id)).map(v=>({id:v.id,name:v.name,latitude:v.latitude,longitude:v.longitude,reading:areaAt(signals,{lat:v.latitude,lng:v.longitude},atLocal,now)}));
  const assessed=venues.filter(v=>v.reading.label!=='insufficient').length;
  return {venues,heat:heatGrid(signals,atLocal,now),stations:signals.stations,events:signals.events,sources:signals.sources,atLocal,generatedAt:new Date(now).toISOString(),expiresAt:signals.expiresAt,activity:[
    {agent:'Discovery',message:`Passed ${venues.length} source-checked alternatives to Crowd.`},
    ...signals.sources.map(source=>({agent:'Crowd',message:source.status==='available'?`${source.kind==='transit'?`${source.count} stations with historical weekday/hour patterns`:`${source.count} located permitted events`}${source.unlocated?`; ${source.unlocated} event locations could not be confirmed`:''}.`:`${source.kind==='transit'?'Station history':'Event information'} unavailable; no conclusion drawn from that source.`})),
    {agent:'Crowd',message:`Area evidence for ${assessed} of ${venues.length} places. Estimates describe surroundings, not restaurant occupancy.`},
    {agent:'Coordinator',message:'Keep experience fit and distance constraints first; use area estimates only within comparable matches.'},
  ]};
}

export function unassessedMap(ids:string[],now:number,atLocal=newYorkLocal(now)):AreaInvestigation{
  return {venues:checkedVenues.filter(v=>ids.includes(v.id)).map(v=>({id:v.id,name:v.name,latitude:v.latitude,longitude:v.longitude,reading:{label:'insufficient',value:null,confidence:'none',because:[],sources:[]}})),heat:[],stations:[],events:[],sources:[],atLocal,generatedAt:new Date(now).toISOString(),expiresAt:0,activity:[]};
}

export function requestedLocalTime(input:unknown,now:number):string{
  if(input===undefined||input===null||input==='')return newYorkLocal(now);
  if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(input))throw Error('Choose a valid New York date and time.');
  const date=new Date(input+'Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==input||input<newYorkLocal(now).slice(0,10)+'T00:00:00'||input>newYorkLocal(now+7*86400_000))throw Error('Area estimates cover today and the next seven days.');
  return input;
}
