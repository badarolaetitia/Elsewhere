export type SearchContext = {
  tasteProfile?: {feature:string;score:number;source:'save'|'rating'|'like'|'dislike'|'manual'|'mixed';evidenceCount:number}[];
  intent: string;
  city: string;
  mode: 'discover' | 'tonight';
  date: string;
  time: string;
  partySize: number;
  taste: string[];
  avoid: string[];
};

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function normalizeSearchContext(raw: any): SearchContext {
  const date = clean(raw?.date, 10);
  const time = clean(raw?.time, 5);
  const parsedDate = new Date(`${date}T12:00:00Z`);
  return {
    ...(Array.isArray(raw?.tasteProfile)?{tasteProfile:raw.tasteProfile.slice(0,16).filter((s:any)=>s&&typeof s.feature==='string'&&s.feature.length<=60&&Number.isFinite(s.score)&&Math.abs(s.score)<=12&&['save','rating','like','dislike','manual','mixed'].includes(s.source)).map((s:any)=>({feature:s.feature,score:s.score,source:s.source,evidenceCount:Math.max(1,Math.min(100,Math.floor(Number(s.evidenceCount)||1)))}))}:{}),
    intent: clean(raw?.intent, 240), city: clean(raw?.city, 100),
    mode: raw?.mode === 'tonight' ? 'tonight' : 'discover',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0,10) === date ? date : '',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '19:00',
    partySize: Number.isInteger(Number(raw?.partySize)) && Number(raw.partySize) >= 1 && Number(raw.partySize) <= 12 ? Number(raw.partySize) : 2,
    avoid: Array.isArray(raw?.avoid) ? [...new Set<string>(raw.avoid.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim().slice(0,60)).filter(Boolean))].slice(0,8) : [],
    taste: Array.isArray(raw?.taste) ? [...new Set<string>(raw.taste.filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim().slice(0,60)).filter(Boolean))].slice(0,8) : [],
  };
}

export function bookingSearchUrl(name: string, address: string, context: SearchContext) {
  const query = [name, address, 'reservations', context.date, context.time, `${context.partySize} people`].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function contextKey(context: SearchContext) { return JSON.stringify(context); }
