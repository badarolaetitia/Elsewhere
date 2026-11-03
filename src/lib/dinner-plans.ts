import {readCollection,writeCollection} from './local-data';
import { normalizeSearchContext, type SearchContext } from './search-context';
export type DinnerPlan = {id:string; name:string; address:string; website?:string; reservationUrl?:string; context:SearchContext};
export function readDinnerPlans():DinnerPlan[]{return readCollection('plans').filter(item=>typeof item.name==='string'&&typeof item.address==='string'&&item.context).map(item=>({...item,context:normalizeSearchContext(item.context)})) as DinnerPlan[];}
export function saveDinnerPlan(plan:DinnerPlan){const next=[plan,...readDinnerPlans().filter(item=>item.id!==plan.id)].slice(0,30);writeCollection('plans',next);return next;}
export function removeDinnerPlan(id:string){const next=readDinnerPlans().filter(item=>item.id!==id);writeCollection('plans',next);return next;}
