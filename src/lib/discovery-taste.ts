import {checkedVenues} from './pilot-catalog';
import type {ExperienceEvidence} from './place-evidence';

export type TasteSource='save'|'rating'|'like'|'dislike'|'manual'|'mixed';
export type TasteSignal={feature:string;score:number;source:TasteSource;evidenceCount:number};
export const tasteFeatureLabels=[...new Set(checkedVenues.flatMap(v=>(v.features??[]).map(f=>f.label)))].sort();
const normalize=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function canonicalTasteFeature(value:string){
 const normalized=normalize(value);
 return tasteFeatureLabels.find(label=>normalize(label)===normalized)??(/^handmade pasta$|^fresh pasta$/.test(normalized)?'Pasta':undefined);
}
export function validateTasteSignals(value:unknown):TasteSignal[]{
 if(!Array.isArray(value))return [];
 const signals=new Map<string,TasteSignal>();
 for(const input of value.slice(0,16)){
  if(!input||typeof input.feature!=='string'||!Number.isFinite(input.score)||!['save','rating','like','dislike','manual','mixed'].includes(input.source))continue;
  const feature=canonicalTasteFeature(input.feature);if(!feature)continue;
  signals.set(feature,{feature,score:Math.max(-12,Math.min(12,input.score)),source:input.source,evidenceCount:Math.max(1,Math.min(100,Math.floor(Number(input.evidenceCount)||1)))});
 }
 return [...signals.values()].filter(s=>s.score!==0);
}
function reason(signal:TasteSignal){
 if(signal.score<0)return `Less aligned with your preference to avoid ${signal.feature}.`;
 const origin=signal.source==='save'?'your saved places':signal.source==='rating'?'places you rated highly':signal.source==='like'?'your explicit visit likes':signal.source==='manual'?'your edited preferences':'your recorded activity';
 return `${signal.feature} matches ${origin}.`;
}
export function applyTasteProfile<T extends {experienceEvidence:Record<string,ExperienceEvidence>}>(candidates:T[],rawSignals:unknown){
 const signals=validateTasteSignals(rawSignals);
 return candidates.map(candidate=>{
  const matched=signals.filter(s=>{const evidence=candidate.experienceEvidence[s.feature];return evidence?.status==='SUPPORTED'&&evidence.sources.length>0;});
  const score=matched.reduce((sum,s)=>sum+s.score,0);
  const strongest=[...matched].sort((a,b)=>Math.abs(b.score)-Math.abs(a.score)).slice(0,2);
  return {...candidate,personalizationBoost:0,personalizationPenalty:0,personalizationTieBreak:score,personalizationReason:strongest.map(reason).join(' ')};
 });
}
