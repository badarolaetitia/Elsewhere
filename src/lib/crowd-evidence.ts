import {checkedVenues} from './pilot-catalog';
import {readDeviceCrowd,writeDeviceCrowd} from './local-data';

export type CrowdLevel='quiet'|'moderate'|'busy';
export type CrowdReport={id:string;venueKey:string;level:CrowdLevel;waitMinutes?:number;at:number;source:'device'};
export type CrowdReading={label:CrowdLevel|'unknown';reports:number;observedAt?:number;ageMinutes?:number;waitMinutes?:number;source?:'device'};
export const REPORT_TTL_MINUTES=120;
export const DUPLICATE_WINDOW_MINUTES=15;
const levels:CrowdLevel[]=['quiet','moderate','busy'];
const venues=new Set(checkedVenues.map(venue=>venue.id));

function valid(value:unknown):value is CrowdReport {
  if(!value||typeof value!=='object')return false;
  const r=value as CrowdReport;
  return typeof r.id==='string'&&venues.has(r.venueKey)&&levels.includes(r.level)&&Number.isFinite(r.at)&&r.source==='device'&&(r.waitMinutes===undefined||(Number.isInteger(r.waitMinutes)&&r.waitMinutes>=0&&r.waitMinutes<=240));
}

export function allCrowdReports():CrowdReport[]{return readDeviceCrowd().filter(valid);}

export function evaluateCrowd(reports:readonly CrowdReport[],key:string,now:number):CrowdReading {
  if(!venues.has(key))return {label:'unknown',reports:0};
  const ttl=REPORT_TTL_MINUTES*60_000;
  const fresh=reports.filter(r=>valid(r)&&r.venueKey===key&&r.at<=now&&now-r.at<ttl);
  if(!fresh.length)return {label:'unknown',reports:0};
  const weight:Record<CrowdLevel,number>={quiet:0,moderate:0,busy:0};
  for(const r of fresh)weight[r.level]+=1-(now-r.at)/ttl;
  const newest=fresh.reduce((a,b)=>b.at>a.at?b:a);
  const top=Math.max(...levels.map(level=>weight[level]));
  const tied=levels.filter(level=>Math.abs(weight[level]-top)<1e-9);
  const label=tied.includes(newest.level)?newest.level:tied[0];
  const supporting=fresh.filter(r=>r.level===label);
  const latest=supporting.reduce((a,b)=>b.at>a.at?b:a);
  const waits=supporting.flatMap(r=>r.waitMinutes===undefined?[]:[r.waitMinutes]).sort((a,b)=>a-b);
  return {label,reports:supporting.length,source:'device',observedAt:latest.at,ageMinutes:Math.floor((now-latest.at)/60_000),...(waits.length?{waitMinutes:waits[Math.floor(waits.length/2)]}:{})};
}

export function addCrowdReport(input:{venueKey:string;level:CrowdLevel;waitMinutes?:number},now=Date.now()):CrowdReport {
  if(!venues.has(input.venueKey))throw Error('Choose a place from the checked West Village list.');
  if(!levels.includes(input.level))throw Error('Choose quiet, moderate or busy.');
  if(input.waitMinutes!==undefined&&(!Number.isInteger(input.waitMinutes)||input.waitMinutes<0||input.waitMinutes>240))throw Error('Enter a wait between 0 and 240 minutes.');
  if(!Number.isFinite(now))throw Error('Invalid report time.');
  const report:CrowdReport={...input,id:`crowd-${now}-${Math.random().toString(36).slice(2,10)}`,at:now,source:'device'};
  const retained=allCrowdReports().filter(r=>r.at<=now&&now-r.at<REPORT_TTL_MINUTES*60_000&&!(r.venueKey===input.venueKey&&now-r.at<DUPLICATE_WINDOW_MINUTES*60_000));
  writeDeviceCrowd([report,...retained].slice(0,500));
  return report;
}

export function describeReading(reading:CrowdReading):string {
  if(reading.label==='unknown')return 'No recent crowd report';
  const label=reading.label[0].toUpperCase()+reading.label.slice(1);
  return [label,reading.waitMinutes!==undefined?`${reading.waitMinutes} min wait`:null,`your report · ${reading.ageMinutes===0?'just now':`${reading.ageMinutes} min ago`}`].filter(Boolean).join(' · ');
}
