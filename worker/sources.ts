import type { Quote } from '../shared/quote';
export const TESTAANKOOP_URL = 'https://www.test-aankoop.be/invest/rekenmodules/goudprijscalculator';
export const ARGENTOR_URL = 'https://www.argentorshop.be/nl/goudstaaf-100-gram-good-delivery-umicore';
const TROY_OUNCE_GRAMS = 31.1034768;
export function validPrice(price: number): number {
  if (!Number.isFinite(price) || price < 10_000 || price > 1_000_000) throw new Error('Invalid EUR/kg quote');
  return Math.round(price * 100) / 100;
}
export function parseTestaankoop(html: string): number {
  // The first calculator option is 24K(999): 99.9% purity, EUR per gram.
  // Normalize to pure-gold EUR/kg so both sources have the same basis.
  for (const tag of html.matchAll(/<input\b[^>]*>/gi)) {
    if (!/data-selector\s*=\s*["']input-conversion["']/i.test(tag[0])) continue;
    const value = tag[0].match(/\bvalue\s*=\s*["']([0-9]+(?:[.,][0-9]+)?)["']/i);
    if (value) return validPrice(Number(value[1].replace(',', '.')) * 1000 / 0.999);
  }
  throw new Error('Testaankoop reference quote not found');
}
export function parseArgentor(data: unknown, now: number): { price: number; sourceUpdatedAt: string } {
  if (!data || typeof data !== 'object' || !('data' in data)) throw new Error('Invalid Argentor response');
  const items = (data as { data?: { metalPrices?: { items?: unknown } } }).data?.metalPrices?.items;
  if (!Array.isArray(items) || !items.length) throw new Error('No Argentor quotes');
  const candidates = items.filter((item): item is { price: number; timestamp: number } =>
    item && typeof item.price === 'number' && typeof item.timestamp === 'number' &&
    item.timestamp * 1000 <= now + 300_000 && item.timestamp * 1000 >= now - 7 * 86400_000);
  const latest = candidates.sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!latest) throw new Error('Argentor feed is out of date');
  // Despite weight: KG, this endpoint returns EUR/troy oz. The publisher's
  // updateLastPricesText() explicitly converts by 1000 / 31.1034768.
  return { price: validPrice(latest.price * 1000 / TROY_OUNCE_GRAMS), sourceUpdatedAt: new Date(latest.timestamp * 1000).toISOString() };
}
async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok || !response.body) throw new Error(`Source HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error('Source response too large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function fetchFastestQuote(): Promise<Quote> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  const signal = controller.signal;
  const base = { currency: 'EUR' as const, unit: 'kg' as const };
  const requests = [
    (async (): Promise<Quote> => {
      const response = await fetch('https://www.argentorshop.be/graphql', {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: 'query {metalPrices(currency: EUR, weight: KG, metal: GOLD, timeInterval: HOUR, nTimeBack: 1){items {timestamp price}}}' }),
      });
      const result = parseArgentor(JSON.parse(await boundedText(response, signal)), Date.now());
      return { ...base, ...result, source: 'argentor', sourceName: 'Argentor', sourceUrl: ARGENTOR_URL, fetchedAt: new Date().toISOString() };
    })(),
    (async (): Promise<Quote> => {
      const response = await fetch(TESTAANKOOP_URL, { signal, headers: { Accept: 'text/html' } });
      const price = parseTestaankoop(await boundedText(response, signal));
      return { ...base, price, source: 'testaankoop', sourceName: 'Testaankoop', sourceUrl: TESTAANKOOP_URL, sourceUpdatedAt: null, fetchedAt: new Date().toISOString() };
    })(),
  ];
  try { return await Promise.any(requests); }
  finally { clearTimeout(timeout); controller.abort(); await Promise.allSettled(requests); }
}
