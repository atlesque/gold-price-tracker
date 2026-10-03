export type SourceId = 'argentor' | 'testaankoop';
export interface Quote {
  price: number;
  currency: 'EUR';
  unit: 'kg';
  source: SourceId;
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  fetchedAt: string;
}
export interface PriceResult {
  quote: Quote | null;
  market: 'open' | 'closed';
  marketReason: 'weekend' | 'daily-break' | null;
  nextRefreshAt: string;
  stale: boolean;
  unavailable: boolean;
  serverTime: string;
}
