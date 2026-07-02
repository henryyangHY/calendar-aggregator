import { describe, it, expect, vi } from 'vitest';
import { cachedResponse } from '../src/cache';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    async match(req: Request) {
      return store.get(new URL(req.url).toString()) ?? undefined;
    },
    async put(req: Request, res: Response) {
      store.set(new URL(req.url).toString(), res);
    },
  } as unknown as Cache;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p, passThroughOnException() {} } as unknown as ExecutionContext;

describe('cachedResponse', () => {
  it('builds and caches on miss', async () => {
    const cache = fakeCache();
    const builder = vi.fn(async () => 'FRESH');
    const res = await cachedResponse(new Request('http://x/all.ics'), ctx, builder, 1800, cache);
    expect(await res.text()).toBe('FRESH');
    expect(res.headers.get('Cache-Control')).toContain('max-age=1800');
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it('serves the cached body on hit without rebuilding', async () => {
    const cache = fakeCache();
    const builder = vi.fn(async () => 'FRESH');
    const req = new Request('http://x/all.ics');
    await cachedResponse(req, ctx, builder, 1800, cache);
    const res2 = await cachedResponse(req, ctx, builder, 1800, cache);
    expect(await res2.text()).toBe('FRESH');
    expect(builder).toHaveBeenCalledTimes(1);
  });
});
