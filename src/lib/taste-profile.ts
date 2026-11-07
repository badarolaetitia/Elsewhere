import {readCollection,writeCollection} from './local-data';
export type SavedPlace = {id: string; name: string; address: string; interests: string[]; categoryFamily?: string};
export type TasteChoice='prefer'|'avoid'|'ignore';
export type TasteSettings={enabled:boolean;choices:Record<string,TasteChoice>};
export const TASTE_SETTINGS_ID='elsewhere:taste-settings:v1';
export function readTasteSettings():TasteSettings {
 const item=readCollection('saved').find(item=>item.id===TASTE_SETTINGS_ID&&item.recordType==='taste-settings');
 const choices:Record<string,TasteChoice>={};
 if(item?.choices&&typeof item.choices==='object')for(const [label,choice] of Object.entries(item.choices).slice(0,32))if(label.length<=60&&['prefer','avoid','ignore'].includes(String(choice)))choices[label]=choice as TasteChoice;
 return {enabled:item?.enabled!==false,choices};
}
export function writeTasteSettings(settings:TasteSettings){
 writeCollection('saved',[...readCollection('saved').filter(item=>item.id!==TASTE_SETTINGS_ID),{id:TASTE_SETTINGS_ID,recordType:'taste-settings',enabled:settings.enabled,choices:settings.choices}]);
 return readTasteSettings();
}
function writePlaces(places:SavedPlace[]){writeCollection('saved',[...places,...readCollection('saved').filter(item=>item.id===TASTE_SETTINGS_ID)]);return places;}
export function readSavedPlaces():SavedPlace[] {
 return readCollection('saved').filter(item=>typeof item.name==='string'&&typeof item.address==='string'&&Array.isArray(item.interests)&&item.interests.every(v=>typeof v==='string')) as SavedPlace[];
}
export function toggleSavedPlace(place:SavedPlace):SavedPlace[]{const current=readSavedPlaces();const next=current.some(item=>item.id===place.id)?current.filter(item=>item.id!==place.id):[place,...current].slice(0,30);return writePlaces(next);}
export function removeSavedPlace(id:string):SavedPlace[]{const next=readSavedPlaces().filter(item=>item.id!==id);return writePlaces(next);}
export function tasteInterests(places = readSavedPlaces()) {
  const counts = new Map<string, number>();
  for (const place of places) for (const interest of place.interests) counts.set(interest,(counts.get(interest) ?? 0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([interest])=>interest);
}
