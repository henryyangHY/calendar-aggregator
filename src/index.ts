import { buildFeed } from './feed';

export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(_request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const body = await buildFeed(env);
      return new Response(body, {
        headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
      });
    } catch {
      return new Response('Failed to build calendar feed', { status: 502 });
    }
  },
};
