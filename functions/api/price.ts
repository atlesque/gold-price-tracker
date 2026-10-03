// Pages binds the same GoldCache class exported by the standalone Worker.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.GOLD_CACHE.getByName('gold-eur-kg-v1').getPrice();
    return Response.json(result, { status: result.unavailable ? 503 : 200, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error(JSON.stringify({ event: 'gold_cache_unavailable', message: error instanceof Error ? error.message : 'Unknown error' }));
    return Response.json({ error: 'Price temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
};
export const onRequest: PagesFunction<Env> = context => context.request.method === 'GET'
  ? onRequestGet(context) : new Response('Method not allowed', { status: 405, headers: { Allow: 'GET' } });
