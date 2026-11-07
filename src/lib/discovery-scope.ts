export const DISCOVERY_CITY = 'New York City';
export const DISCOVERY_SCOPE_MESSAGE = 'Elsewhere currently supports New York City only. Search a place in NYC.';
const key = (value: unknown) => typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() : '';
const boroughs = new Set(['new york','new york city','nyc','manhattan','brooklyn','queens','bronx','the bronx','staten island']);
export function isSupportedCity(value: unknown) { return !key(value) || boroughs.has(key(value)); }
export function isNycFeature(feature: any): boolean {
  const p=feature?.properties??{};
  const [lon,lat]=feature?.geometry?.coordinates??[];
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon < -74.26||lon > -73.69||lat < 40.49||lat > 40.92)return false;
  if(p.country_code && key(p.country_code)!=='us')return false;
  if(p.country && !['united states','united states of america','usa','us'].includes(key(p.country)))return false;
  if(p.state && !['new york','ny'].includes(key(p.state)))return false;
  return [p.city,p.town,p.village,p.borough,p.city_district,p.county].some(value=>boroughs.has(key(value)));
}
