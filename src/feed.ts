import type { Env } from './index';
import { fetchSources } from './config';
import { fetchAll } from './fetcher';
import { parseIcs } from './parser';
import { transformVevent } from './transformer';
import { assemble } from './assembler';
import { unavailableEvent } from './placeholder';

export const FETCH_TIMEOUT_MS = 10000;

export async function buildFeed(env: Env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const sources = await fetchSources(env.SOURCES_URL, fetchImpl);
  const results = await fetchAll(sources, FETCH_TIMEOUT_MS, fetchImpl);

  const vevents: string[] = [];
  const vtimezones: string[] = [];

  for (const r of results) {
    if (!r.ok) {
      vevents.push(unavailableEvent(r.label));
      continue;
    }
    const parsed = parseIcs(r.text);
    vtimezones.push(...parsed.vtimezones);
    for (const ev of parsed.vevents) {
      vevents.push(transformVevent(ev, r.label, r.category));
    }
  }

  return assemble(vevents, vtimezones);
}
