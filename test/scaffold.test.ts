import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { type Env } from '../src/index';

afterEach(() => vi.restoreAllMocks());

describe('handler', () => {
  it('returns 502 when the source feed cannot be built', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const env: Env = { SOURCES_URL: 'http://host/sources.json' };
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(new Request('http://x/all.ics'), env, ctx);
    expect(res.status).toBe(502);
  });
});
