import {checkedVenues} from './pilot-catalog';
import {canonicalTasteFeature,type TasteSignal,type TasteSource} from './discovery-taste';
import {readSavedPlaces,readTasteSettings,type SavedPlace,type TasteSettings} from './taste-profile';
import {readVisits,type Visit} from './visit-feedback';

export type ProfileTrait=TasteSignal&{explanation:string;choice:'prefer'|'avoid'|'ignore'|'auto'};
export function buildDiscoveryProfile(saves:SavedPlace[],visits:Visit[],settings:TasteSettings){
 const traits=new Map<string,{weak:number;positive:number;negative:number;sources:Set<TasteSource>;count:number}>();
 const venues=new Map(checkedVenues.map(v=>[v.id,v]));
 const rated=new Set(visits.map(v=>v.id)),seen=new Set<string>();
 function add(feature:string,score:number,source:TasteSource){
  const trait=traits.get(feature)??{weak:0,positive:0,negative:0,sources:new Set<TasteSource>(),count:0};
  if(source==='save'||source==='rating')trait.weak=Math.min(3,trait.weak+score);
  else if(score>0)trait.positive=Math.min(12,trait.positive+score);else trait.negative=Math.max(-12,trait.negative+score);
  trait.sources.add(source);trait.count++;traits.set(feature,trait);
 }
 let usedSaves=0,usedVisits=0;
 for(const save of saves){
  const venue=venues.get(save.id);if(!venue||rated.has(save.id)||seen.has(save.id))continue;seen.add(save.id);usedSaves++;
  const selected=new Set(save.interests.map(canonicalTasteFeature).filter(Boolean));
  for(const feature of venue.features??[])if(!selected.size||selected.has(feature.label))add(feature.label,1,'save');
 }
 seen.clear();
 for(const visit of visits){
  const venue=venues.get(visit.id);if(!venue||seen.has(visit.id))continue;seen.add(visit.id);usedVisits++;
  const liked=new Set(visit.liked.map(canonicalTasteFeature).filter(Boolean)),disliked=new Set((visit.disliked??[]).map(canonicalTasteFeature).filter(Boolean));
  for(const feature of venue.features??[]){
   if(disliked.has(feature.label))add(feature.label,visit.rating<=2?-6:-4,'dislike');
   else if(liked.has(feature.label))add(feature.label,visit.rating===5?6:visit.rating===4?4:visit.rating===3?2:1,'like');
   else if(visit.rating>=4&&!liked.size)add(feature.label,1,'rating');
  }
 }
 for(const label of Object.keys(settings.choices)){const feature=canonicalTasteFeature(label);if(feature&&!traits.has(feature))traits.set(feature,{weak:0,positive:0,negative:0,sources:new Set(),count:0});}
 const profile:ProfileTrait[]=[...traits].map(([feature,trait])=>{
  const choice:ProfileTrait['choice']=Object.prototype.hasOwnProperty.call(settings.choices,feature)?settings.choices[feature]:'auto';
  const inferred=Math.max(-12,Math.min(12,trait.positive+trait.negative+(trait.negative<0?0:trait.weak)));
  const score=choice==='prefer'?12:choice==='avoid'?-12:choice==='ignore'?0:inferred;
  const source:TasteSource=choice!=='auto'?'manual':trait.sources.size>1?'mixed':[...trait.sources][0]??'manual';
  const explanation=choice==='ignore'?'Excluded by you.':choice!=='auto'?'Set by you.':source==='save'?'Interest inferred from saved places.':source==='rating'?'Offerings at places you rated highly; not a confirmed like.':source==='like'?'Explicitly liked in your visit feedback.':source==='dislike'?'Explicitly disliked in your visit feedback.':'Based on your recorded activity.';
  return {feature,score,source,evidenceCount:trait.count,explanation,choice};
 }).sort((a,b)=>Math.abs(b.score)-Math.abs(a.score)||Number(b.choice!=='auto')-Number(a.choice!=='auto')||a.feature.localeCompare(b.feature));
 return {traits:profile,signals:settings.enabled?profile.filter(t=>t.score!==0).slice(0,16).map(({feature,score,source,evidenceCount})=>({feature,score,source,evidenceCount})):[],usedSaves,usedVisits,enabled:settings.enabled};
}
export function readDiscoveryProfile(){return buildDiscoveryProfile(readSavedPlaces(),readVisits(),readTasteSettings());}
