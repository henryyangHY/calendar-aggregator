// test/scaffold.test.ts
import { describe, it, expect } from 'vitest';
import worker, { type Env } from '../src/index';

describe('scaffold', () => {
  it('returns a text/calendar response', async () => {
    const env: Env = { SOURCES_URL: 'http://example.test/sources.json' };
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(new Request('http://x/all.ics'), env, ctx);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(await res.text()).toContain('BEGIN:VCALENDAR');
  });
});
