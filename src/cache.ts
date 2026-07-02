export const CACHE_TTL_SECONDS = 1800;
// When the feed is degraded (a source failed and a placeholder was inserted), cache
// only briefly so a transient upstream blip clears within minutes instead of being
// frozen into subscribers' feeds for the full 30 minutes.
export const DEGRADED_TTL_SECONDS = 120;

export interface BuiltFeed {
  body: string;
  ttl: number;
}

export async function cachedResponse(
  request: Request,
  ctx: ExecutionContext,
  builder: () => Promise<BuiltFeed>,
  cache: Cache = caches.default,
): Promise<Response> {
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const { body, ttl } = await builder();
  const response = new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
