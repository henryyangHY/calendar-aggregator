import { describe, it, expect, vi } from 'vitest';
import { fetchAll, fetchOne } from '../src/fetcher';
import type { Source } from '../src/config';

const sources: Source[] = [
  { url: 'http://ok', label: 'OK', category: 'A' },
  { url: 'http://bad', label: 'Bad', category: 'B' },
];

describe('fetchAll', () => {
  it('returns ok text for good sources and isolates failures', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'http://ok') {
        return { ok: true, status: 200, text: async () => 'ICS-OK' } as Response;
      }
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const results = await fetchAll(sources, 1000, fetchImpl, 1, 0);
    const ok = results.find((r) => r.label === 'OK')!;
    const bad = results.find((r) => r.label === 'Bad')!;
    expect(ok.ok).toBe(true);
    expect(ok.text).toBe('ICS-OK');
    expect(bad.ok).toBe(false);
    expect(bad.text).toBe('');
  });

  it('marks a non-2xx response as not ok', async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: false, status: 404, text: async () => '' }) as Response,
    ) as unknown as typeof fetch;
    const results = await fetchAll([sources[0]], 1000, fetchImpl, 1, 0);
    expect(results[0].ok).toBe(false);
  });
});

describe('fetchOne retry + headers', () => {
  it('retries once and succeeds on the second attempt', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return { ok: true, status: 200, text: async () => 'RECOVERED' } as Response;
    }) as unknown as typeof fetch;

    const r = await fetchOne(sources[0], 1000, fetchImpl, 1, 0);
    expect(r.ok).toBe(true);
    expect(r.text).toBe('RECOVERED');
    expect(calls).toBe(2);
  });

  it('gives up after the retry is exhausted (initial + 1 retry = 2 calls)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    const r = await fetchOne(sources[0], 1000, fetchImpl, 1, 0);
    expect(r.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sends a descriptive User-Agent header', async () => {
    let seen: Record<string, string> | undefined;
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.headers as Record<string, string>;
      return { ok: true, status: 200, text: async () => 'x' } as Response;
    }) as unknown as typeof fetch;

    await fetchOne(sources[0], 1000, fetchImpl, 1, 0);
    expect(seen?.['User-Agent']).toContain('calendar-aggregator');
  });
});
