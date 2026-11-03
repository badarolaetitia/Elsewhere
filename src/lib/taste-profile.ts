import {readCollection,writeCollection} from './local-data';
export type SavedPlace = {id: string; name: string; address: string; interests: string[]; categoryFamily?: string};
export function readSavedPlaces():SavedPlace[] {
 return readCollection('saved').filter(item=>typeof item.name==='string'&&typeof item.address==='string'&&Array.isArray(item.interests)&&item.interests.every(v=>typeof v==='string')) as SavedPlace[];
}
export function toggleSavedPlace(place:SavedPlace):SavedPlace[]{const current=readSavedPlaces();const next=current.some(item=>item.id===place.id)?current.filter(item=>item.id!==place.id):[place,...current].slice(0,30);writeCollection('saved',next);return next;}
export function removeSavedPlace(id:string):SavedPlace[]{const next=readSavedPlaces().filter(item=>item.id!==id);writeCollection('saved',next);return next;}
export function tasteInterests(places = readSavedPlaces()) {
  const counts = new Map<string, number>();
  for (const place of places) for (const interest of place.interests) counts.set(interest,(counts.get(interest) ?? 0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([interest])=>interest);
}
