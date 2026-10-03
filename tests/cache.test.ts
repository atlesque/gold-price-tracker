import { describe, it, expect, vi } from 'vitest';
import { QuoteCache, type CacheState, type StateStore } from '../worker/cache';
import type { Quote } from '../shared/quote';
const MONDAY = Date.parse('2026-10-05T12:00:00Z');
function fixture() {
  let now = MONDAY;
  let state: CacheState = { quote: null, nextAttemptAt: 0 };
  const store: StateStore = { read: () => state, write: value => { state = value; } };
  const quote = (): Quote => ({ price: 118339.5, currency: 'EUR', unit: 'kg', source: 'argentor', sourceName: 'Argentor', sourceUrl: 'https://www.argentorshop.be/', fetchedAt: new Date(now).toISOString(), sourceUpdatedAt: new Date(now).toISOString() });
  const fetch = vi.fn(async () => quote());
  const cache = new QuoteCache(store, fetch, () => now);
  return { cache, fetch, store, quote, setTime: (time: number) => { now = time; }, now: () => now };
}
describe('global demand-driven price cache', () => {
  it('shares one fetch for 100 concurrent cold requests', async () => {
    const f = fixture();
    const results = await Promise.all(Array.from({ length: 100 }, () => f.cache.get()));
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(results.every(r => r.quote?.price === 118339.5)).toBe(true);
  });
  it('only refreshes after 60 seconds and a visitor request', async () => {
    const f = fixture(); await f.cache.get();
    f.setTime(MONDAY + 59_999); await f.cache.get(); expect(f.fetch).toHaveBeenCalledTimes(1);
    f.setTime(MONDAY + 600_000); expect(f.fetch).toHaveBeenCalledTimes(1);
    await Promise.all(Array.from({ length: 30 }, () => f.cache.get()));
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('cache validity is a full minute after fetch completion', async () => {
    const f = fixture();
    f.fetch.mockImplementationOnce(async () => { f.setTime(MONDAY + 9000); return f.quote(); });
    await f.cache.get(); f.setTime(MONDAY + 68_999); await f.cache.get();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    f.setTime(MONDAY + 69_000); await f.cache.get(); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('persists cooldown across object reconstruction', async () => {
    const f = fixture(); await f.cache.get();
    const reconstructed = new QuoteCache(f.store, f.fetch, f.now);
    await reconstructed.get(); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps the previous quote for the entire weekend with no polling', async () => {
    const f = fixture(); f.setTime(Date.parse('2026-10-02T20:59:00Z')); await f.cache.get();
    f.setTime(Date.parse('2026-10-03T12:00:00Z'));
    const result = await f.cache.get();
    expect(result.market).toBe('closed'); expect(result.stale).toBe(false);
    expect(result.nextRefreshAt).toBe('2026-10-04T22:00:00.000Z');
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('bootstraps an empty weekend cache once on demand, then freezes it', async () => {
    const f = fixture(); f.setTime(Date.parse('2026-10-03T12:00:00Z'));
    await f.cache.get(); f.setTime(Date.parse('2026-10-04T12:00:00Z')); await f.cache.get();
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('serves stale data on upstream failure and suppresses retry storms', async () => {
    const f = fixture(); await f.cache.get(); f.setTime(MONDAY + 60_000);
    f.fetch.mockRejectedValue(new Error('sources offline'));
    const result = await f.cache.get(); expect(result.stale).toBe(true); expect(result.quote).not.toBeNull();
    await Promise.all(Array.from({ length: 100 }, () => f.cache.get()));
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('reports unavailable without a fabricated price and preserves failed-fetch cooldown', async () => {
    const f = fixture(); f.fetch.mockRejectedValue(new Error('offline'));
    const result = await f.cache.get(); expect(result.unavailable).toBe(true); expect(result.quote).toBeNull();
    await new QuoteCache(f.store, f.fetch, f.now).get(); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
