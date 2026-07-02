import { describe, it, expect, vi } from 'vitest';
import { parseSources, fetchSources } from '../src/config';

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('parseSources', () => {
  it('parses a valid list and defaults category to label', () => {
    const out = parseSources({ sources: [{ url: 'u', label: 'Partiful' }] });
    expect(out).toEqual([{ url: 'u', label: 'Partiful', category: 'Partiful' }]);
  });

  it('throws when the shape is wrong', () => {
    expect(() => parseSources({ nope: true })).toThrow();
    expect(() => parseSources({ sources: [{ label: 'x' }] })).toThrow();
  });
});

describe('fetchSources', () => {
  it('fetches and parses', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ sources: [{ url: 'u', label: 'L', category: 'C' }] }),
    ) as unknown as typeof fetch;
    const out = await fetchSources('http://x/sources.json', fetchImpl);
    expect(out[0].label).toBe('L');
  });

  it('falls back to the last good list on failure', async () => {
    const good = vi.fn(async () =>
      jsonResponse({ sources: [{ url: 'u', label: 'Good', category: 'C' }] }),
    ) as unknown as typeof fetch;
    await fetchSources('http://x/sources.json', good);

    const bad = vi.fn(async () => jsonResponse({}, false)) as unknown as typeof fetch;
    const out = await fetchSources('http://x/sources.json', bad);
    expect(out[0].label).toBe('Good');
  });
});
