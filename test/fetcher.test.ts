import { describe, it, expect, vi } from 'vitest';
import { fetchAll } from '../src/fetcher';
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

    const results = await fetchAll(sources, 1000, fetchImpl);
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
    const results = await fetchAll([sources[0]], 1000, fetchImpl);
    expect(results[0].ok).toBe(false);
  });
});
