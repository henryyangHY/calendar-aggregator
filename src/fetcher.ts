import type { Source } from './config';

export interface FetchResult {
  label: string;
  category: string;
  ok: boolean;
  text: string;
}

// A descriptive User-Agent reduces throttling from providers (notably Google's
// public .ics endpoint) that deprioritize requests with a blank/absent UA coming
// from datacenter IPs like Cloudflare's edge.
const USER_AGENT =
  'Mozilla/5.0 (compatible; calendar-aggregator/1.0; +https://github.com/henryyangHY/calendar-aggregator)';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function attemptFetch(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/calendar, text/plain, */*' },
    });
    if (!res.ok) return { ok: false, text: '' };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOne(
  source: Source,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  retries = 1,
  retryDelayMs = 500,
): Promise<FetchResult> {
  const base = { label: source.label, category: source.category };
  let attempt = await attemptFetch(source.url, timeoutMs, fetchImpl);
  for (let i = 0; i < retries && !attempt.ok; i++) {
    if (retryDelayMs > 0) await sleep(retryDelayMs);
    attempt = await attemptFetch(source.url, timeoutMs, fetchImpl);
  }
  return { ...base, ...attempt };
}

export async function fetchAll(
  sources: Source[],
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  retries = 1,
  retryDelayMs = 500,
): Promise<FetchResult[]> {
  return Promise.all(
    sources.map((s) => fetchOne(s, timeoutMs, fetchImpl, retries, retryDelayMs)),
  );
}
