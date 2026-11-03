import type { GenerateContentResponse } from '@google/genai';

export type ExperienceEvidence = {
  status: 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNKNOWN';
  summary: string;
  sources: { title: string; url: string }[];
};

type DiscoveryCandidate = {
  candidateId: string;
  name: string;
  categories: string[];
  metadata?: Record<string, string>;
  distance: number | null;
};

const words = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
export function selectFinalists<T extends DiscoveryCandidate>(
  candidates: T[], categories: string[], keywords: string[], limit = 30
): T[] {
  const terms = new Set(words(keywords.join(' ')));
  const relevance = (candidate: T) => {
    const categoryScore = Math.max(0, ...candidate.categories.flatMap(category =>
      categories.map(target => category === target || category.startsWith(`${target}.`)
        ? target.split('.').length * 20 : 0)));
    const tokens = new Set(words(`${candidate.name} ${candidate.categories.join(' ')} ${Object.values(candidate.metadata ?? {}).join(' ')}`));
    return categoryScore + [...terms].filter(term => tokens.has(term)).length * 3;
  };
  return [...candidates].sort((a, b) => relevance(b) - relevance(a) || a.candidateId.localeCompare(b.candidateId)).slice(0, limit);
}
export function readExperienceEvidence(raw: unknown, response: GenerateContentResponse): ExperienceEvidence {
  const unknown: ExperienceEvidence = { status: 'UNKNOWN', summary: 'Not yet verified.', sources: [] };
  if (!raw || typeof raw !== 'object') return unknown;
  const item = raw as Record<string, unknown>;
  if (!['SUPPORTED', 'NOT_SUPPORTED'].includes(String(item.status)) || typeof item.summary !== 'string' || item.summary.trim().length < 12) return unknown;
  if (item.status === 'NOT_SUPPORTED' && item.basis !== 'EXPLICIT_DENIAL') return unknown;
  const summary = item.summary.trim();
  if (/no (?:explicit )?(?:information|evidence|indication|sources|mention)|not (?:found|listed|mentioned|confirmed)|(?:cannot|could not|unable to) (?:confirm|verify|find)|(?:does not|doesn.t) (?:mention|list)|insufficient evidence/i.test(summary)) return unknown;
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const sources = new Map<string, {title: string; url: string}>();
  for (const support of metadata?.groundingSupports ?? []) {
    const segment = support.segment?.text ?? '';
    if (!segment.includes(summary) && !segment.includes(JSON.stringify(summary).slice(1, -1))) continue;
    for (const index of support.groundingChunkIndices ?? []) {
      const web = metadata?.groundingChunks?.[index]?.web;
      if (!web?.uri) continue;
      try {
        const url = new URL(web.uri);
        if (url.protocol !== 'https:' || url.username || url.password) continue;
        sources.set(url.href, {title: web.title || url.hostname, url: url.href});
      } catch {  }
    }
  }
  if (!sources.size) return unknown;
  return {status: item.status as ExperienceEvidence['status'], summary, sources: [...sources.values()]};
}

export function matchesVerifiedPreferences(
  candidate: {experienceEvidence?: Record<string, ExperienceEvidence>}, keywords: string[]
): boolean {
  return keywords.every(keyword => {
    const evidence = candidate.experienceEvidence?.[keyword];
    return evidence?.status === 'SUPPORTED' && evidence.sources.some(source => {
      try { const url = new URL(source.url); return url.protocol === 'https:' && !url.username && !url.password; }
      catch { return false; }
    });
  });
}

export function venueWebsite(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') ||
      /^(?:[\d.]+|\[.*\])$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
