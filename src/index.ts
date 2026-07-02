export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    });
  },
};
