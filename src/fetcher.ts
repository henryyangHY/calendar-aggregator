import type { Source } from './config';

export interface FetchResult {
  label: string;
  category: string;
  ok: boolean;
  text: string;
}

export async function fetchOne(
  source: Source,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult> {
  const base = { label: source.label, category: source.category };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(source.url, { signal: controller.signal });
    if (!res.ok) return { ...base, ok: false, text: '' };
    return { ...base, ok: true, text: await res.text() };
  } catch {
    return { ...base, ok: false, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAll(
  sources: Source[],
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult[]> {
  return Promise.all(sources.map((s) => fetchOne(s, timeoutMs, fetchImpl)));
}
