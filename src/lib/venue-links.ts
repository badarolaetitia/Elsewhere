export function venueLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
        !url.hostname.includes('.') || /^(?:[\d.]+|\[.*\])$/.test(url.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
export function venueDestination(website: unknown, reservationUrl?: unknown) {
  const reservation = venueLink(reservationUrl);
  if (reservation) return {url: reservation, label: 'Open booking website ↗'};
  const official = venueLink(website);
  return official ? {url: official, label: 'Visit restaurant website ↗'} : null;
}
