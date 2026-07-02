import type { Env } from './index';
import { fetchSources } from './config';
import { fetchAll } from './fetcher';
import { parseIcs } from './parser';
import { transformVevent } from './transformer';
import { assemble } from './assembler';
import { unavailableEvent } from './placeholder';

export const FETCH_TIMEOUT_MS = 10000;

export interface FeedResult {
  body: string;
  // true when at least one source failed and a placeholder was inserted, so the
  // caller can cache the degraded feed for a shorter time.
  degraded: boolean;
}

export async function buildFeed(env: Env, fetchImpl: typeof fetch = fetch): Promise<FeedResult> {
  const sources = await fetchSources(env.SOURCES_URL, fetchImpl);
  const results = await fetchAll(sources, FETCH_TIMEOUT_MS, fetchImpl);

  // If every event-source failed, do NOT return (and cache) a placeholder-only
  // feed — throw so the handler returns 502 and subscribers keep their last good
  // sync. Partial failures still merge, with a placeholder for the dead source.
  if (results.length > 0 && results.every((r) => !r.ok)) {
    throw new Error('All calendar sources failed to load');
  }

  const vevents: string[] = [];
  const vtimezones: string[] = [];
  let degraded = false;

  for (const r of results) {
    if (!r.ok) {
      vevents.push(unavailableEvent(r.label));
      degraded = true;
      continue;
    }
    const parsed = parseIcs(r.text);
    vtimezones.push(...parsed.vtimezones);
    for (const ev of parsed.vevents) {
      vevents.push(transformVevent(ev, r.label, r.category));
    }
  }

  return { body: assemble(vevents, vtimezones), degraded };
}
