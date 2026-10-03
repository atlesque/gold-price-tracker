import { DurableObject } from 'cloudflare:workers';
import { QuoteCache, type CacheState } from './cache';
import { fetchFastestQuote } from './sources';
export class GoldCache extends DurableObject<Env> {
  private cache: QuoteCache;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // SQL is synchronous: checking state and reserving a refresh cannot interleave.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS cache (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)');
    this.cache = new QuoteCache({
      read: () => {
        const row = ctx.storage.sql.exec<{ value: string }>('SELECT value FROM cache WHERE id = 1').toArray()[0];
        return row ? JSON.parse(row.value) as CacheState : { quote: null, nextAttemptAt: 0 };
      },
      write: state => { ctx.storage.sql.exec('INSERT OR REPLACE INTO cache (id, value) VALUES (1, ?)', JSON.stringify(state)); },
    }, fetchFastestQuote);
  }
  async getPrice() { return this.cache.get(); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/api/price') return new Response('Not found', { status: 404 });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
    const result = await env.GOLD_CACHE.getByName('gold-eur-kg-v1').getPrice();
    return Response.json(result, { status: result.unavailable ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  },
} satisfies ExportedHandler<Env>;
