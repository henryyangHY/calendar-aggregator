import { describe, it, expect, vi } from 'vitest';
import { buildFeed } from '../src/feed';
import type { Env } from '../src/index';

const SOURCES_JSON = {
  sources: [
    { url: 'http://a.ics', label: 'Alpha', category: 'A' },
    { url: 'http://b.ics', label: 'Beta', category: 'B' },
  ],
};

const ICS_A = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:1@a',
  'SUMMARY:Alpha Party',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function fetchImplFactory(betaFails: boolean): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('sources.json')) {
      return { ok: true, status: 200, json: async () => SOURCES_JSON } as Response;
    }
    if (url === 'http://a.ics') {
      return { ok: true, status: 200, text: async () => ICS_A } as Response;
    }
    if (url === 'http://b.ics') {
      if (betaFails) throw new Error('down');
      return { ok: true, status: 200, text: async () => ICS_A.replace(/Alpha/g, 'Beta').replace('1@a', '1@b') } as Response;
    }
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
}

const env: Env = { SOURCES_URL: 'http://host/sources.json' };

describe('buildFeed', () => {
  it('merges and labels events from all sources', async () => {
    const out = await buildFeed(env, fetchImplFactory(false));
    expect(out).toContain('SUMMARY:[Alpha] Alpha Party');
    expect(out).toContain('SUMMARY:[Beta] Beta Party');
    expect(out.startsWith('BEGIN:VCALENDAR')).toBe(true);
  });

  it('inserts a placeholder for a failed source but keeps the rest', async () => {
    const out = await buildFeed(env, fetchImplFactory(true));
    expect(out).toContain('SUMMARY:[Alpha] Alpha Party');
    expect(out).toContain('temporarily unavailable');
  });

  it('rejects when every event source fails', async () => {
    const allFailImpl: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('sources.json')) {
        return { ok: true, status: 200, json: async () => SOURCES_JSON } as Response;
      }
      throw new Error('down');
    }) as unknown as typeof fetch;

    await expect(buildFeed(env, allFailImpl)).rejects.toThrow();
  });
});
