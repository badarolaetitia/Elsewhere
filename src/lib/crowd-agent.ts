import {checkedVenues} from './pilot-catalog';
import {evaluateCrowd,type CrowdReading,type CrowdReport} from './crowd-evidence';
import type {AreaInvestigation} from './area-crowd';

type Candidate={placeId:string|null;elsewhereScore:number;focusMatchScore:number;crowdPriorityKey?:string};
export const MAX_SIMILAR_FIT_GAP=5;
const checkedIds=new Set(checkedVenues.map(v=>v.id));
const crowdOrder={quiet:0,moderate:1,busy:2};

export function crowdForVenue(id:string|null,reports:readonly CrowdReport[],now:number):CrowdReading {
  return id&&checkedIds.has(id)?evaluateCrowd(reports,id,now):{label:'unknown',reports:0};
}

export function coordinateCrowd<T extends Candidate>(candidates:readonly T[],reports:readonly CrowdReport[],options:{preferQuiet:boolean;closest?:boolean;now:number}) {
  const result=[...candidates];
  let reordered=0;
  if(options.preferQuiet&&!options.closest){
    for(let start=0;start<result.length;){
      const anchor=result[start];
      let end=start+1;
      while(end<result.length&&result[end].focusMatchScore===anchor.focusMatchScore&&result[end].crowdPriorityKey===anchor.crowdPriorityKey&&Math.abs(result[end].elsewhereScore-anchor.elsewhereScore)<=MAX_SIMILAR_FIT_GAP)end++;
      const slots:number[]=[];
      for(let i=start;i<end;i++)if(crowdForVenue(result[i].placeId,reports,options.now).label!=='unknown')slots.push(i);
      const known=slots.map(i=>result[i]).sort((a,b)=>{
        const ca=crowdForVenue(a.placeId,reports,options.now).label as keyof typeof crowdOrder;
        const cb=crowdForVenue(b.placeId,reports,options.now).label as keyof typeof crowdOrder;
        return crowdOrder[ca]-crowdOrder[cb];
      });
      slots.forEach((slot,i)=>{if(result[slot]!==known[i])reordered++;result[slot]=known[i];});
      start=end;
    }
  }
  const reported=candidates.filter(c=>crowdForVenue(c.placeId,reports,options.now).label!=='unknown').length;
  return {recommendations:result,activity:{checked:reported,total:candidates.length,reordered,status:!options.preferQuiet?'off':options.closest?'distance-first':reported===0?'no-evidence':'complete'}};
}

export function coordinateArea<T extends Candidate>(candidates:readonly T[],investigation:AreaInvestigation|null,options:{preferQuiet:boolean;closest?:boolean;now:number}):T[]{
  const result=[...candidates];
  if(!options.preferQuiet||options.closest||!investigation||options.now>=investigation.expiresAt)return result;
  const readings=new Map(investigation.venues.filter(v=>checkedIds.has(v.id)&&v.reading.value!==null).map(v=>[v.id,v.reading.value!]));
  for(let start=0;start<result.length;){
    const anchor=result[start];let end=start+1;
    while(end<result.length&&result[end].focusMatchScore===anchor.focusMatchScore&&result[end].crowdPriorityKey===anchor.crowdPriorityKey&&Math.abs(result[end].elsewhereScore-anchor.elsewhereScore)<=MAX_SIMILAR_FIT_GAP)end++;
    const slots:number[]=[];
    for(let i=start;i<end;i++)if(result[i].placeId&&readings.has(result[i].placeId!))slots.push(i);
    const known=slots.map(i=>result[i]).sort((a,b)=>readings.get(a.placeId!)!-readings.get(b.placeId!)!);
    slots.forEach((slot,i)=>{result[slot]=known[i];});start=end;
  }
  return result;
}
