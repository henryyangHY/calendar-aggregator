import { buildFeed } from './feed';
import { cachedResponse } from './cache';

export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await cachedResponse(request, ctx, () => buildFeed(env));
    } catch {
      return new Response('Failed to build calendar feed', { status: 502 });
    }
  },
};
