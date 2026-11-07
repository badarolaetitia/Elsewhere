import {isNycFeature,isSupportedCity} from './discovery-scope';
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cityKey = (value: string) => normalize(value).replace(/\b(?:city of|city)\b/g, '').trim().replace(/^nyc$/, 'new york');

export function matchingPlace(features: any[], query: string, city = '') {
  const requestedCity = cityKey(city || query.split(',').slice(1).join(' '));
  return features.filter(feature => {
    const p = feature?.properties ?? {};
    const coordinates = feature?.geometry?.coordinates;
    if (!p.name || !Array.isArray(coordinates) || !coordinates.every(Number.isFinite)) return false;
    if (p.result_type && p.result_type !== 'amenity') return false;
    const areas = [p.city, p.town, p.village, p.county, p.suburb, p.state, p.country].filter(Boolean).map(normalize);
    if (requestedCity && !(isSupportedCity(city) && city && isNycFeature(feature)) && !areas.some(area => {
      const key = cityKey(area);
      return key === requestedCity || requestedCity.startsWith(`${key} `) || requestedCity.endsWith(` ${key}`);
    })) return false;
    let nameQuery = normalize(query.split(',')[0]);
    for (const area of areas) nameQuery = nameQuery.replace(new RegExp(`(?:^| )${area.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?= |$)`, 'g'), ' ').trim();
    const terms = nameQuery.split(/\s+/).filter(term => term.length > 1 && !['the', 'and'].includes(term));
    const name = normalize(p.name);
    return terms.length > 0 && terms.every(term => name.split(' ').includes(term));
  })[0] ?? null;
}

export class PlaceLookupUnavailableError extends Error {
  constructor(){super('Place search is temporarily unavailable. Please try again.');}
}
export async function lookupPlace(query: string, city: string, apiKey: string, signal: AbortSignal,
  fetchJson: (url: string, signal: AbortSignal) => Promise<any>) {
  signal.throwIfAborted();
  const location = city && isSupportedCity(city) ? 'New York' : city;
  const text = [query, location].filter(Boolean).join(', ');
  const complete = new AbortController();
  const lookupSignal = AbortSignal.any([signal, complete.signal, AbortSignal.timeout(25_000)]);
  try {
    let failed = false;
    for (const method of ['autocomplete', 'search']) {
      try {
      const url = new URL(`https://api.geoapify.com/v1/geocode/${method}`);
      for (const [key, value] of Object.entries({text, limit: '5', format: 'geojson', apiKey})) url.searchParams.set(key, value);
      const data = await fetchJson(url.toString(), lookupSignal);
      const match = matchingPlace(data?.features ?? [], query, city);
      if(match)return match;
      } catch { signal.throwIfAborted(); failed = true; }
    }
    if(failed)throw new PlaceLookupUnavailableError();
    return null;
  } catch (error) {
    signal.throwIfAborted();
    throw new PlaceLookupUnavailableError();
  } finally {
    complete.abort();
  }
}
