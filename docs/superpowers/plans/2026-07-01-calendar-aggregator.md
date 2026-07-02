# Calendar Aggregator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloudflare Worker that merges several `.ics` feeds into one labelled iCalendar document served at a single public URL, so ~60 classmates can subscribe once and see all events.

**Architecture:** On each request the Worker reads a remote `sources.json`, parallel-fetches every source `.ics`, prefixes each event's `SUMMARY`/`UID` with its source label (preserving timezones and recurrence verbatim), reassembles one `VCALENDAR`, and serves it behind a 30-minute edge cache. No scheduler; work happens only on cache-miss.

**Tech Stack:** Cloudflare Workers, Wrangler CLI, TypeScript, Vitest. No external iCal library — text-level processing.

## Global Constraints

- Runtime: Cloudflare Workers (`export default { fetch }` module syntax).
- Language: TypeScript, ES modules.
- Test runner: Vitest. Pure modules take injected `fetch`/`cache`/`ctx` so they run in Vitest's default (node) environment — no Workers pool required.
- Line endings in all generated iCalendar output: CRLF (`\r\n`).
- Response content type: `text/calendar; charset=utf-8`.
- Per-source fetch timeout: `10000` ms.
- Feed edge-cache TTL: `1800` seconds (30 min).
- No external runtime dependencies for iCal parsing/serialization.
- Source list is NOT hardcoded — it is loaded at request time from `env.SOURCES_URL` (a remote `sources.json`), so sources change with no redeploy.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `sources.example.json`
- Test: `test/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run dev`; `src/index.ts` exporting a default fetch handler (placeholder body for now).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "calendar-aggregator",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240000.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.60.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "calendar-aggregator"
main = "src/index.ts"
compatibility_date = "2024-06-01"

[vars]
SOURCES_URL = "https://raw.githubusercontent.com/henryyangHY/calendar-aggregator-sources/main/sources.json"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create `sources.example.json`** (documents the shape; the real file lives in its own public repo)

```json
{
  "sources": [
    { "url": "https://partiful.com/example/feed.ics", "label": "Partiful", "category": "Social" },
    { "url": "https://campusgroups.example/ical/feed.ics", "label": "CampusGroups", "category": "Campus" },
    { "url": "https://calendar.google.com/calendar/ical/example/basic.ics", "label": "Shared", "category": "Personal" }
  ]
}
```

- [ ] **Step 6: Create placeholder `src/index.ts`**

```ts
export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
    });
  },
};
```

- [ ] **Step 7: Write the scaffold test**

```ts
// test/scaffold.test.ts
import { describe, it, expect } from 'vitest';
import worker, { type Env } from '../src/index';

describe('scaffold', () => {
  it('returns a text/calendar response', async () => {
    const env: Env = { SOURCES_URL: 'http://example.test/sources.json' };
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(new Request('http://x/all.ics'), env, ctx);
    expect(res.headers.get('Content-Type')).toContain('text/calendar');
    expect(await res.text()).toContain('BEGIN:VCALENDAR');
  });
});
```

- [ ] **Step 8: Install and run tests**

Run: `npm install && npm test`
Expected: 1 test passes.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts src/index.ts sources.example.json test/scaffold.test.ts
git commit -m "chore: scaffold Cloudflare Worker project"
```

---

### Task 2: iCalendar block parser

**Files:**
- Create: `src/parser.ts`
- Test: `test/parser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ParsedIcs { vevents: string[]; vtimezones: string[] }`
  - `function parseIcs(icsText: string): ParsedIcs` — returns raw `VEVENT` and `VTIMEZONE` blocks as strings, each beginning `BEGIN:<NAME>` and ending `END:<NAME>`, joined with `\r\n`. Content is preserved verbatim (no unfolding here).

- [ ] **Step 1: Write the failing test**

```ts
// test/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseIcs } from '../src/parser';

const SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VTIMEZONE',
  'TZID:America/Chicago',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:evt-1@partiful',
  'SUMMARY:Kickoff',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evt-2@partiful',
  'SUMMARY:Mixer',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcs', () => {
  it('extracts every VEVENT block', () => {
    const { vevents } = parseIcs(SAMPLE);
    expect(vevents).toHaveLength(2);
    expect(vevents[0]).toContain('UID:evt-1@partiful');
    expect(vevents[0].startsWith('BEGIN:VEVENT')).toBe(true);
    expect(vevents[0].endsWith('END:VEVENT')).toBe(true);
  });

  it('extracts VTIMEZONE blocks', () => {
    const { vtimezones } = parseIcs(SAMPLE);
    expect(vtimezones).toHaveLength(1);
    expect(vtimezones[0]).toContain('TZID:America/Chicago');
  });

  it('tolerates LF-only line endings', () => {
    const lf = SAMPLE.replace(/\r\n/g, '\n');
    expect(parseIcs(lf).vevents).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/parser.test.ts`
Expected: FAIL — cannot find module `../src/parser`.

- [ ] **Step 3: Write the implementation**

```ts
// src/parser.ts
export interface ParsedIcs {
  vevents: string[];
  vtimezones: string[];
}

function extractBlocks(icsText: string, blockName: string): string[] {
  const lines = icsText.split(/\r?\n/);
  const begin = `BEGIN:${blockName}`;
  const end = `END:${blockName}`;
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === begin) {
      current = [line];
    } else if (line === end && current) {
      current.push(line);
      blocks.push(current.join('\r\n'));
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return blocks;
}

export function parseIcs(icsText: string): ParsedIcs {
  return {
    vevents: extractBlocks(icsText, 'VEVENT'),
    vtimezones: extractBlocks(icsText, 'VTIMEZONE'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/parser.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/parser.ts test/parser.test.ts
git commit -m "feat: add iCalendar block parser"
```

---

### Task 3: Event transformer (labels, UID prefix, category)

**Files:**
- Create: `src/transformer.ts`
- Test: `test/transformer.test.ts`

**Interfaces:**
- Consumes: a single `VEVENT` block string (from `parseIcs`).
- Produces: `function transformVevent(vevent: string, label: string, category: string): string`
  - Prefixes the `SUMMARY` value with `[label] `.
  - Prefixes the `UID` value with `<slug(label)>-` (slug = lowercased, non-alphanumerics → `-`).
  - Ensures a `CATEGORIES` line contains `category` (appends if present, inserts before `END:VEVENT` if absent).
  - Unfolds RFC-5545 folded lines before editing; output is unfolded, CRLF-joined.

- [ ] **Step 1: Write the failing test**

```ts
// test/transformer.test.ts
import { describe, it, expect } from 'vitest';
import { transformVevent } from '../src/transformer';

const EVENT = [
  'BEGIN:VEVENT',
  'UID:abc-123@partiful.com',
  'DTSTART;TZID=America/Chicago:20260710T180000',
  'SUMMARY:Welcome Mixer',
  'END:VEVENT',
].join('\r\n');

describe('transformVevent', () => {
  it('prefixes SUMMARY with the label', () => {
    const out = transformVevent(EVENT, 'Partiful', 'Social');
    expect(out).toContain('SUMMARY:[Partiful] Welcome Mixer');
  });

  it('prefixes UID with the label slug', () => {
    const out = transformVevent(EVENT, 'Campus Groups', 'Campus');
    expect(out).toContain('UID:campus-groups-abc-123@partiful.com');
  });

  it('adds a CATEGORIES line when none exists', () => {
    const out = transformVevent(EVENT, 'Partiful', 'Social');
    expect(out).toContain('CATEGORIES:Social');
    expect(out.indexOf('CATEGORIES')).toBeLessThan(out.indexOf('END:VEVENT'));
  });

  it('appends to an existing CATEGORIES line', () => {
    const withCat = EVENT.replace('SUMMARY:Welcome Mixer', 'CATEGORIES:Party\r\nSUMMARY:Welcome Mixer');
    const out = transformVevent(withCat, 'Partiful', 'Social');
    expect(out).toContain('CATEGORIES:Party,Social');
  });

  it('unfolds a folded SUMMARY before prefixing', () => {
    const folded = EVENT.replace('SUMMARY:Welcome Mixer', 'SUMMARY:Welcome\r\n  Mixer');
    const out = transformVevent(folded, 'Partiful', 'Social');
    expect(out).toContain('SUMMARY:[Partiful] Welcome Mixer');
  });

  it('preserves DTSTART with its TZID verbatim', () => {
    const out = transformVevent(EVENT, 'Partiful', 'Social');
    expect(out).toContain('DTSTART;TZID=America/Chicago:20260710T180000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/transformer.test.ts`
Expected: FAIL — cannot find module `../src/transformer`.

- [ ] **Step 3: Write the implementation**

```ts
// src/transformer.ts
function unfold(block: string): string {
  // RFC 5545: a CRLF (or LF) followed by a space or tab is a line continuation.
  return block.replace(/\r?\n[ \t]/g, '');
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function transformVevent(vevent: string, label: string, category: string): string {
  const lines = unfold(vevent).split(/\r?\n/);
  const out: string[] = [];
  let hasCategories = false;

  for (let line of lines) {
    if (/^SUMMARY[:;]/.test(line)) {
      const idx = line.indexOf(':');
      line = `${line.slice(0, idx)}:[${label}] ${line.slice(idx + 1)}`;
    } else if (/^UID[:;]/.test(line)) {
      const idx = line.indexOf(':');
      line = `${line.slice(0, idx)}:${slug(label)}-${line.slice(idx + 1)}`;
    } else if (/^CATEGORIES[:;]/.test(line)) {
      hasCategories = true;
      line = `${line},${category}`;
    }
    out.push(line);
  }

  if (!hasCategories) {
    const endIdx = out.findIndex((l) => l === 'END:VEVENT');
    const at = endIdx === -1 ? out.length : endIdx;
    out.splice(at, 0, `CATEGORIES:${category}`);
  }

  return out.join('\r\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/transformer.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/transformer.ts test/transformer.test.ts
git commit -m "feat: add event transformer with labels and categories"
```

---

### Task 4: Calendar assembler (UID + timezone de-dup)

**Files:**
- Create: `src/assembler.ts`
- Test: `test/assembler.test.ts`

**Interfaces:**
- Consumes: transformed `VEVENT` strings and raw `VTIMEZONE` strings.
- Produces: `function assemble(vevents: string[], vtimezones: string[]): string`
  - Wraps a clean `VCALENDAR` (VERSION/PRODID/CALSCALE/METHOD/X-WR-CALNAME).
  - De-duplicates `VTIMEZONE` blocks by `TZID`.
  - Drops events with a duplicate `UID` (keeps first).
  - CRLF line endings; trailing CRLF.

- [ ] **Step 1: Write the failing test**

```ts
// test/assembler.test.ts
import { describe, it, expect } from 'vitest';
import { assemble } from '../src/assembler';

const ev = (uid: string, summary: string) =>
  ['BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${summary}`, 'END:VEVENT'].join('\r\n');
const tz = (id: string) =>
  ['BEGIN:VTIMEZONE', `TZID:${id}`, 'END:VTIMEZONE'].join('\r\n');

describe('assemble', () => {
  it('wraps events in a single VCALENDAR', () => {
    const out = assemble([ev('a', 'One'), ev('b', 'Two')], []);
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(out).toContain('VERSION:2.0');
    expect(out).toContain('UID:a');
    expect(out).toContain('UID:b');
  });

  it('drops events whose UID collides (keeps first)', () => {
    const out = assemble([ev('dup', 'First'), ev('dup', 'Second')], []);
    expect(out).toContain('SUMMARY:First');
    expect(out).not.toContain('SUMMARY:Second');
  });

  it('de-duplicates VTIMEZONE blocks by TZID', () => {
    const out = assemble([ev('a', 'One')], [tz('America/Chicago'), tz('America/Chicago')]);
    const count = out.split('TZID:America/Chicago').length - 1;
    expect(count).toBe(1);
  });

  it('uses CRLF and ends with a trailing CRLF', () => {
    const out = assemble([ev('a', 'One')], []);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out).not.toMatch(/[^\r]\n/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/assembler.test.ts`
Expected: FAIL — cannot find module `../src/assembler`.

- [ ] **Step 3: Write the implementation**

```ts
// src/assembler.ts
function firstMatch(block: string, re: RegExp): string {
  const m = block.match(re);
  return m ? m[1].trim() : block;
}

function dedupeBy(blocks: string[], key: (b: string) => string): string[] {
  const seen = new Set<string>();
  return blocks.filter((b) => {
    const k = key(b);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function assemble(vevents: string[], vtimezones: string[]): string {
  const uniqueTz = dedupeBy(vtimezones, (b) => firstMatch(b, /^TZID:(.*)$/m));
  const uniqueEvents = dedupeBy(vevents, (b) => firstMatch(b, /^UID:(.*)$/m));

  const parts = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//henry//calendar-aggregator//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Aggregated Calendar',
    ...uniqueTz,
    ...uniqueEvents,
    'END:VCALENDAR',
  ];
  return parts.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/assembler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/assembler.ts test/assembler.test.ts
git commit -m "feat: add calendar assembler with UID and timezone de-dup"
```

---

### Task 5: Source config loader (remote sources.json + stale fallback)

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: `env.SOURCES_URL`.
- Produces:
  - `interface Source { url: string; label: string; category: string }`
  - `function parseSources(data: unknown): Source[]` — validates shape, throws on invalid, defaults `category` to `label`.
  - `async function fetchSources(url: string, fetchImpl?: typeof fetch): Promise<Source[]>` — fetches + parses; on failure returns the last successfully-loaded list (module-level memo) or rethrows if none.

- [ ] **Step 1: Write the failing test**

```ts
// test/config.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — cannot find module `../src/config`.

- [ ] **Step 3: Write the implementation**

```ts
// src/config.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add remote source config loader with stale fallback"
```

---

### Task 6: Parallel fetcher (timeout + failure isolation)

**Files:**
- Create: `src/fetcher.ts`
- Test: `test/fetcher.test.ts`

**Interfaces:**
- Consumes: `Source[]` (from `config.ts`).
- Produces:
  - `interface FetchResult { label: string; category: string; ok: boolean; text: string }`
  - `async function fetchOne(source: Source, timeoutMs: number, fetchImpl?: typeof fetch): Promise<FetchResult>` — aborts after `timeoutMs`; any error or non-2xx yields `{ ok: false, text: '' }`.
  - `async function fetchAll(sources: Source[], timeoutMs: number, fetchImpl?: typeof fetch): Promise<FetchResult[]>` — all in parallel; never rejects.

- [ ] **Step 1: Write the failing test**

```ts
// test/fetcher.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fetcher.test.ts`
Expected: FAIL — cannot find module `../src/fetcher`.

- [ ] **Step 3: Write the implementation**

```ts
// src/fetcher.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/fetcher.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/fetcher.ts test/fetcher.test.ts
git commit -m "feat: add parallel fetcher with timeout and failure isolation"
```

---

### Task 7: Feed builder + unavailable-source placeholder

**Files:**
- Create: `src/placeholder.ts`
- Create: `src/feed.ts`
- Modify: `src/index.ts`
- Test: `test/placeholder.test.ts`
- Test: `test/feed.test.ts`

**Interfaces:**
- Consumes: `fetchSources`, `fetchAll`, `parseIcs`, `transformVevent`, `assemble`.
- Produces:
  - `function unavailableEvent(label: string): string` — an all-day `VEVENT` string `⚠️ [label] temporarily unavailable`, dated today (UTC).
  - `async function buildFeed(env: Env, fetchImpl?: typeof fetch): Promise<string>` — the full orchestration; failed sources become a placeholder event instead of dropping the whole feed.
  - `FETCH_TIMEOUT_MS = 10000` constant lives in `src/feed.ts`.

- [ ] **Step 1: Write the failing placeholder test**

```ts
// test/placeholder.test.ts
import { describe, it, expect } from 'vitest';
import { unavailableEvent } from '../src/placeholder';

describe('unavailableEvent', () => {
  it('produces an all-day VEVENT flagged unavailable', () => {
    const out = unavailableEvent('Partiful');
    expect(out).toContain('BEGIN:VEVENT');
    expect(out).toContain('SUMMARY:⚠️ [Partiful] temporarily unavailable');
    expect(out).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
    expect(out).toContain('END:VEVENT');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/placeholder.test.ts`
Expected: FAIL — cannot find module `../src/placeholder`.

- [ ] **Step 3: Implement placeholder**

```ts
// src/placeholder.ts
function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function unavailableEvent(label: string): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return [
    'BEGIN:VEVENT',
    `UID:unavailable-${slug(label)}-${today}`,
    `DTSTART;VALUE=DATE:${today}`,
    `SUMMARY:⚠️ [${label}] temporarily unavailable`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].join('\r\n');
}
```

- [ ] **Step 4: Write the failing feed test**

```ts
// test/feed.test.ts
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
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run test/feed.test.ts`
Expected: FAIL — cannot find module `../src/feed`.

- [ ] **Step 6: Implement the feed builder**

```ts
// src/feed.ts
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
```

- [ ] **Step 7: Wire the handler to the feed builder**

Replace the whole body of `src/index.ts` with:

```ts
// src/index.ts
import { buildFeed } from './feed';

export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(_request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const body = await buildFeed(env);
      return new Response(body, {
        headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
      });
    } catch {
      return new Response('Failed to build calendar feed', { status: 502 });
    }
  },
};
```

Note: `src/feed.ts` imports `Env` from `src/index.ts` and `src/index.ts` imports `buildFeed` from `src/feed.ts`. This type-only cycle is fine under ES modules; keep `Env` exported from `index.ts`.

- [ ] **Step 8: Update the scaffold test for the new behavior**

Replace `test/scaffold.test.ts` with a test that stubs global `fetch` so the handler returns 502 when sources cannot load (no network in tests):

```ts
// test/scaffold.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { type Env } from '../src/index';

afterEach(() => vi.restoreAllMocks());

describe('handler', () => {
  it('returns 502 when the source feed cannot be built', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const env: Env = { SOURCES_URL: 'http://host/sources.json' };
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(new Request('http://x/all.ics'), env, ctx);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: all tests pass (parser, transformer, assembler, config, fetcher, placeholder, feed, handler).

- [ ] **Step 10: Commit**

```bash
git add src/placeholder.ts src/feed.ts src/index.ts test/placeholder.test.ts test/feed.test.ts test/scaffold.test.ts
git commit -m "feat: add feed builder, unavailable placeholder, wire handler"
```

---

### Task 8: Edge caching

**Files:**
- Create: `src/cache.ts`
- Modify: `src/index.ts`
- Test: `test/cache.test.ts`

**Interfaces:**
- Consumes: a `builder: () => Promise<string>` and a `Cache`/`ExecutionContext`.
- Produces:
  - `CACHE_TTL_SECONDS = 1800` constant.
  - `async function cachedResponse(request: Request, ctx: ExecutionContext, builder: () => Promise<string>, ttl?: number, cache?: Cache): Promise<Response>` — returns cached body on hit; otherwise builds, stores via `ctx.waitUntil`, returns fresh response with `Cache-Control: public, max-age=<ttl>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/cache.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cache.test.ts`
Expected: FAIL — cannot find module `../src/cache`.

- [ ] **Step 3: Implement the cache module**

```ts
// src/cache.ts
export const CACHE_TTL_SECONDS = 1800;

export async function cachedResponse(
  request: Request,
  ctx: ExecutionContext,
  builder: () => Promise<string>,
  ttl: number = CACHE_TTL_SECONDS,
  cache: Cache = caches.default,
): Promise<Response> {
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const body = await builder();
  const response = new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire caching into the handler**

Replace `src/index.ts` with:

```ts
// src/index.ts
import { buildFeed } from './feed';
import { cachedResponse } from './cache';

export interface Env {
  SOURCES_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await cachedResponse(request, ctx, () => buildFeed(env));
    } catch {
      return new Response('Failed to build calendar feed', { status: 502 });
    }
  },
};
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all tests pass. (The handler test from Task 7 still returns 502: `buildFeed` throws inside the builder, which propagates through `cachedResponse`.)

- [ ] **Step 7: Commit**

```bash
git add src/cache.ts src/index.ts test/cache.test.ts
git commit -m "feat: add 30-minute edge caching for the merged feed"
```

---

### Task 9: Deploy, publish sources.json, manual verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a live Worker URL and a public `sources.json`; a documented operating procedure.

- [ ] **Step 1: Create the public sources repo**

Create a new **public** GitHub repo (suggested: `henryyangHY/calendar-aggregator-sources`) containing `sources.json` with the real feeds:

```json
{
  "sources": [
    { "url": "<real Partiful .ics URL>",    "label": "Partiful",     "category": "Social" },
    { "url": "<real CampusGroups .ics URL>", "label": "CampusGroups", "category": "Campus" },
    { "url": "<real shared calendar .ics URL>", "label": "Shared",    "category": "Personal" }
  ]
}
```

Confirm the raw URL resolves: `curl -sSL https://raw.githubusercontent.com/henryyangHY/calendar-aggregator-sources/main/sources.json | head`
Expected: the JSON body. If the repo name differs, update `SOURCES_URL` in `wrangler.toml` to match.

- [ ] **Step 2: Authenticate Wrangler**

Run: `npx wrangler login`
Expected: browser auth flow completes; `npx wrangler whoami` shows your account.

- [ ] **Step 3: Deploy**

Run: `npm run deploy`
Expected: Wrangler prints a deployed URL like `https://calendar-aggregator.<subdomain>.workers.dev`.

- [ ] **Step 4: Verify content type and structure**

Run: `curl -sS -D - https://calendar-aggregator.<subdomain>.workers.dev/all.ics -o /tmp/agg.ics | grep -i content-type`
Expected: `content-type: text/calendar; charset=utf-8`.

Run: `head -5 /tmp/agg.ics`
Expected: begins with `BEGIN:VCALENDAR` / `VERSION:2.0`.

Run: `grep -c 'BEGIN:VEVENT' /tmp/agg.ics`
Expected: a count > 0 (matches the sum of source events).

- [ ] **Step 5: Verify labelling and source-failure resilience**

Run: `grep 'SUMMARY:' /tmp/agg.ics | head`
Expected: summaries prefixed like `SUMMARY:[Partiful] …`, `SUMMARY:[CampusGroups] …`.

To confirm resilience, temporarily point one source URL in `sources.json` at a broken URL, wait for cache to expire (or deploy a new version to bust cache), re-`curl`, and confirm the feed still returns plus a `temporarily unavailable` event appears. Then restore `sources.json`.

- [ ] **Step 6: Subscribe end-to-end in Google Calendar**

In Google Calendar → Other calendars → **From URL** → paste the Worker URL → Add calendar. Confirm events appear with `[label]` prefixes and correct times/timezones. (Google may take a few minutes on first add.)

- [ ] **Step 7: Write README with the operating procedure**

```markdown
# Calendar Aggregator

A Cloudflare Worker that merges multiple `.ics` calendar feeds into one labelled
calendar, served at a single public URL for classmates to subscribe to.

## Subscribe
Add this URL in Google/Apple Calendar as a "from URL" subscription:
`https://calendar-aggregator.<subdomain>.workers.dev/all.ics`

## Add or remove a source (no redeploy)
Edit `sources.json` in the public sources repo
(`henryyangHY/calendar-aggregator-sources`) via the GitHub web editor and save.
Each entry: `{ "url": "...", "label": "...", "category": "..." }`.
Changes take effect within 30 minutes (edge-cache TTL).

## Develop
- `npm install`
- `npm test` — run the Vitest suite
- `npm run dev` — local Worker (set SOURCES_URL in wrangler.toml)
- `npm run deploy` — publish to Cloudflare

## How it works
On each cache-miss the Worker reads `sources.json`, parallel-fetches every feed
(10s timeout, failures isolated), prefixes each event's SUMMARY/UID with its source
label while preserving timezones and recurrence verbatim, reassembles one VCALENDAR,
and caches it for 30 minutes. Subscriber count is not a scaling factor; upstream feeds
are fetched at most ~48×/day regardless of how many people subscribe.
```

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "docs: add README with subscribe and source-management instructions"
```

---

## Notes for the implementer

- The type-only import cycle between `src/index.ts` (`Env`) and `src/feed.ts`/`src/cache.ts` is intentional and safe under ES modules. If you prefer, move `Env` to a `src/env.ts` and import it from both — but do it consistently across all files.
- `caches.default` and `ExecutionContext` are Workers globals provided by `@cloudflare/workers-types`; unit tests never touch them because `cachedResponse` accepts injected `cache`/`ctx`.
- Do not add an iCal library. Every transform is line-oriented on purpose to keep source timezones and recurrence rules byte-for-byte intact.
