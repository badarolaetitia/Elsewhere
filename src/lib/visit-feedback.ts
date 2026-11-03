import {readCollection,writeCollection} from './local-data';
export type Visit = {id:string;name:string;address:string;categoryFamily?:string;rating:number;liked:string[];disliked?:string[];note:string};
export const feedbackTags=['Food or product','Atmosphere','Good value','Service','Handmade pasta','Quiet setting','Lively setting','Creative selection'];
export function readVisits():Visit[]{return readCollection('visits').filter(v=>typeof v.name==='string'&&typeof v.address==='string'&&Number.isInteger(v.rating)&&Number(v.rating)>=1&&Number(v.rating)<=5&&Array.isArray(v.liked)).map(v=>({...v,disliked:Array.isArray(v.disliked)?v.disliked.filter((x):x is string=>typeof x==='string').slice(0,8):[],liked:(v.liked as unknown[]).filter((x):x is string=>typeof x==='string').slice(0,8),note:typeof v.note==='string'?v.note.slice(0,240):''})) as Visit[];}
function write(visits:Visit[]){writeCollection('visits',visits);return visits;}
export function saveVisit(visit:Visit) {if(!Number.isInteger(visit.rating)||visit.rating<1||visit.rating>5)throw Error('Choose a rating from 1 to 5.');return write([{...visit,note:visit.note.trim().slice(0,240),liked:[...new Set(visit.liked)].slice(0,8),disliked:[...new Set(visit.disliked??[])].filter(tag=>!visit.liked.includes(tag)).slice(0,8)},...readVisits().filter(v=>v.id!==visit.id)].slice(0,100));}
export function removeVisit(id:string) {return write(readVisits().filter(v=>v.id!==id));}
export function learnedTaste(visits=readVisits()) {
  const scores=new Map<string,number>();
  for(const visit of visits)for(const tag of visit.liked)scores.set(tag,(scores.get(tag)??0)+(visit.rating>=4?visit.rating-3:0));
  return [...scores].filter(([,score])=>score>0).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([tag])=>tag);
}

export function learnedAvoids(visits=readVisits()) {
  const scores=new Map<string,number>();
  for(const visit of visits) for(const tag of visit.disliked??[]) scores.set(tag,(scores.get(tag)??0)+(visit.rating<=2?2:1));
  return [...scores].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([tag])=>tag);
}
