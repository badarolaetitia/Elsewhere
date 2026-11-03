import type {ExperienceEvidence} from './place-evidence';
const tokens=(text:string):string[]=>text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[\p{L}\p{N}]{4,}/gu)??[];
export function personalizeCandidates<T extends {experienceEvidence:Record<string,ExperienceEvidence>}>(candidates:T[],taste:string[],hasExplicitIntent:boolean,avoid:string[]=[]){
  return candidates.map(candidate=>{
    const matching=(preferences:string[])=>preferences.filter(preference=>{
      const terms=tokens(preference);
      return terms.length>0&&Object.entries(candidate.experienceEvidence).some(([keyword,evidence])=>evidence.status==='SUPPORTED'&&terms.every(term=>tokens(`${keyword} ${evidence.summary}`).includes(term)));
    });
    const matches=matching(taste);
    const avoided=matching(avoid);
    return {...candidate,personalizationPenalty:hasExplicitIntent?0:Math.min(6,avoided.length*2),personalizationBoost:hasExplicitIntent?0:Math.min(6,matches.length*2),personalizationTieBreak:matches.length-avoided.length,personalizationReason:matches.length?`Based on your preferences: ${matches.join(', ')}.`:''};
  });
}
