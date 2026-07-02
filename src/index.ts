import { buildFeed } from './feed';
import { cachedResponse, CACHE_TTL_SECONDS, DEGRADED_TTL_SECONDS } from './cache';

export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await cachedResponse(request, ctx, async () => {
        const { body, degraded } = await buildFeed(env);
        return { body, ttl: degraded ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS };
      });
    } catch {
      return new Response('Failed to build calendar feed', { status: 502 });
    }
  },
};
