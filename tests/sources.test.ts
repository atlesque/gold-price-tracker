import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseArgentor, parseTestaankoop, fetchFastestQuote } from '../worker/sources';
const time = Date.parse('2026-10-03T10:00:00Z');
const html = '<input value="118,22115938288316181232208196" data-selector="input-conversion" /><input value="88,75" data-selector="input-conversion" />';
describe('source normalization', () => {
  it('normalizes the observed Testaankoop 999-purity gram quote to pure EUR/kg', () => {
    expect(parseTestaankoop(html)).toBe(118339.5);
  });
  it('uses the latest Argentor point and the publisher’s ounce conversion', () => {
    expect(parseArgentor({ data: { metalPrices: { items: [
      { price: 3680.75, timestamp: time / 1000 }, { price: 3600, timestamp: time / 1000 - 60 },
    ] } } }, time).price).toBe(118338.86);
  });
  it('rejects challenge pages, retail-only prices, malformed and stale feeds', () => {
    expect(() => parseTestaankoop('<html>Just a moment...</html>')).toThrow();
    expect(() => parseTestaankoop('<meta property="product:price:amount" content="12346.65"/>')).toThrow();
    expect(() => parseArgentor({ data: { metalPrices: { items: [{ price: 0, timestamp: time / 1000 }] } } }, time)).toThrow();
    expect(() => parseArgentor({ data: { metalPrices: { items: [{ price: 3680, timestamp: time / 1000 - 8 * 86400 }] } } }, time)).toThrow();
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('first-valid-response race', () => {
  it('accepts a valid second response when the fastest source fails', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => String(url).includes('graphql')
      ? new Response('bad gateway', { status: 502 }) : new Response(html));
    vi.stubGlobal('fetch', fetch);
    expect((await fetchFastestQuote()).source).toBe('testaankoop'); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('fails when both sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 503 })));
    await expect(fetchFastestQuote()).rejects.toThrow();
  });
  it('does not let a fast response with invalid data win', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => String(url).includes('graphql')
      ? Response.json({ data: { metalPrices: { items: [] } } }) : new Response(html)));
    expect((await fetchFastestQuote()).source).toBe('testaankoop');
  });
  it('aborts the slower source as soon as a valid quote wins', async () => {
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init: RequestInit) => {
      if (!String(url).includes('graphql')) return Promise.resolve(new Response(html));
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
      });
    }));
    expect((await fetchFastestQuote()).source).toBe('testaankoop');
    expect(aborted).toBe(true);
  });
});
