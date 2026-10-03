import type { Quote, PriceResult } from '../shared/quote';
import { marketStatus } from './market';
export interface CacheState { quote: Quote | null; nextAttemptAt: number; }
export interface StateStore { read(): CacheState; write(state: CacheState): void; }
export class QuoteCache {
  private pending: Promise<void> | null = null;
  constructor(private store: StateStore, private fetchQuote: () => Promise<Quote>, private now: () => number = Date.now) {}
  async get(): Promise<PriceResult> {
    let state = this.store.read();
    const time = this.now(), market = marketStatus(time);
    // Requests during a refresh join the same promise. A persisted cooldown
    // prevents retries after an eviction or restart from bypassing the limit.
    if (this.pending) await this.pending;
    else if (time >= state.nextAttemptAt && (market.open || !state.quote)) {
      this.store.write({ ...state, nextAttemptAt: time + 60_000 });
      this.pending = this.refresh(state).finally(() => { this.pending = null; });
      await this.pending;
    }
    state = this.store.read();
    const end = this.now(), finalMarket = marketStatus(end);
    const next = !finalMarket.open && state.quote ? finalMarket.nextOpenAt : Math.max(end + 1000, state.nextAttemptAt);
    return {
      quote: state.quote, market: finalMarket.open ? 'open' : 'closed', marketReason: finalMarket.reason,
      stale: !!state.quote && finalMarket.open && end - Date.parse(state.quote.fetchedAt) >= 60_000,
      unavailable: !state.quote, nextRefreshAt: new Date(next).toISOString(), serverTime: new Date(end).toISOString(),
    };
  }
  private async refresh(previous: CacheState): Promise<void> {
    try {
      const quote = await this.fetchQuote();
      // A full minute of cache validity starts when the fetch completes.
      this.store.write({ quote, nextAttemptAt: this.now() + 60_000 });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'gold_sources_unavailable', message: error instanceof Error ? error.message : 'Unknown error' }));
      this.store.write({ ...previous, nextAttemptAt: this.now() + 60_000 });
    }
  }
}
