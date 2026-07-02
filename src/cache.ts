export const CACHE_TTL_SECONDS = 1800;

export async function cachedResponse(
  request: Request,
  ctx: ExecutionContext,
  builder: () => Promise<string>,
  ttl: number = CACHE_TTL_SECONDS,
  cache: Cache = caches.default,
): Promise<Response> {
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const body = await builder();
  const response = new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
