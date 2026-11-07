import data from '../data/nyc-pilot-venues.json';

export type PilotFeature = {label:string; summary:string; sourceUrl:string};
export type PilotVenue = {
  id:string; camis:string; name:string; aliases:string[]; address:string;
  borough:string; zip:string; latitude:number; longitude:number; cuisine:string;
  categoryFamily:string; checkedAt:string; identitySources:string[];
  website?:string; features?:PilotFeature[];
};

const catalog: Omit<typeof data,'venues'> & {venues:PilotVenue[]} = data;
export const checkedVenues = catalog.venues.filter(venue => (venue.features?.length ?? 0) > 0);
export default catalog;
