export interface Source {
  url: string;
  label: string;
  category: string;
}

export function parseSources(data: unknown): Source[] {
  const sources = (data as { sources?: unknown })?.sources;
  if (!Array.isArray(sources)) {
    throw new Error('Invalid sources.json: expected { "sources": [...] }');
  }
  return sources.map((s, i) => {
    const src = s as Partial<Source>;
    if (typeof src.url !== 'string' || typeof src.label !== 'string') {
      throw new Error(`Invalid source at index ${i}: "url" and "label" are required`);
    }
    return {
      url: src.url,
      label: src.label,
      category: typeof src.category === 'string' ? src.category : src.label,
    };
  });
}

// Module-level memo (per Worker isolate): the stale fallback survives only
// within a warm isolate and is null on a cold start, at which point a
// sources.json failure correctly propagates and yields a 502 to the client.
let lastGoodSources: Source[] | null = null;

export async function fetchSources(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Source[]> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`sources.json fetch failed: ${res.status}`);
    const parsed = parseSources(await res.json());
    lastGoodSources = parsed;
    return parsed;
  } catch (err) {
    if (lastGoodSources) return lastGoodSources;
    throw err;
  }
}
