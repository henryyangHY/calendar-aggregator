# Calendar Aggregator — Design Spec

**Date:** 2026-07-01
**Author:** Henry Yang (design by Claude)
**Status:** Approved for planning

## Problem

Henry subscribes to several calendar feeds (`.ics` URLs) — e.g. Partiful, a personal
shared Google calendar, CampusGroups event feeds. He wants classmates (~60 people) to
see **all** upcoming events in one place by subscribing to a **single** URL.

Google/Apple Calendar can subscribe to external `.ics` feeds, but a subscribed
external calendar **cannot be re-shared** as a subscribable URL. So a middle layer is
required: something that fetches the source feeds, merges them into one iCalendar
document, and serves it at a stable public URL.

## Goals

- One public URL (`X`) that returns a merged iCalendar document combining all sources.
- Each event is prefixed with its source label (e.g. `[Partiful]`) so subscribers can
  tell where an event came from.
- Adding/removing a source is a **low-friction, no-deploy** operation Henry can do from
  a phone or browser.
- Zero scheduled maintenance; always reasonably fresh.
- Comfortably handle ~60 subscribers (and far more).

## Non-Goals (v1 — YAGNI)

- No per-subscriber customization or auth on `X` (it's a public read-only feed).
- No web admin UI for managing sources (editing a JSON file is enough).
- No event de-duplication across sources beyond UID-collision safety.
- No filtering/exclusion of events (may come later).
- No two-way sync or write-back to any source.

## Architecture

A single **Cloudflare Worker**. Subscribers subscribe to the Worker's URL. On each
request, the Worker returns a merged iCalendar document, protected by an edge cache so
upstream sources are not hit on every request.

```
Subscriber calendar app
        │  subscribes to  https://<worker>.workers.dev/all.ics
        ▼
  ┌─────────────────┐
  │ Cloudflare      │  1. check edge cache (hit → return cached body)
  │ Worker          │  2. read sources.json (source list)
  │ (aggregator)    │  3. parallel-fetch each source .ics (timeout, isolate failures)
  │                 │  4. parse → prefix each VEVENT's SUMMARY with [label]
  │                 │  5. assemble one VCALENDAR → return + cache
  └─────────────────┘
     ▲   ▲   ▲
  Partiful / CampusGroups / personal shared calendar / …
```

### Why on-the-fly merge (no scheduler)

Calendar clients refresh external `.ics` feeds only every ~8–24 hours in the
background. The Worker therefore needs no cron of its own — it works only when fetched,
and a cache (default 30-minute TTL) collapses repeated fetches so upstream sources are
hit at most ~48 times/day regardless of subscriber count.

### Source management (no-deploy)

The source list lives in an **external JSON file** (`sources.json`) hosted in a public
GitHub repo. The Worker fetches it (also cached). To add/remove a source, Henry edits
`sources.json` in the GitHub web editor and saves — no terminal, no `wrangler deploy`.

`sources.json` shape:

```json
{
  "sources": [
    { "url": "https://partiful.com/.../feed.ics", "label": "Partiful",     "category": "Social" },
    { "url": "https://campusgroups.../ical/...",  "label": "CampusGroups", "category": "Campus" },
    { "url": "https://calendar.google.com/.../basic.ics", "label": "Shared", "category": "Personal" }
  ]
}
```

If `sources.json` fails to load, the Worker falls back to the last successfully-cached
copy (stale-if-error).

## Components

Single Worker, split into single-purpose, independently testable modules:

| Module        | Responsibility                                                              | In → Out                          |
|---------------|-----------------------------------------------------------------------------|-----------------------------------|
| `config`      | Load & validate `sources.json` (remote URL), with stale fallback            | — → `Source[]`                    |
| `fetcher`     | Parallel-fetch all sources; per-source timeout; isolate single failures     | `Source[]` → `{label, ok, text}[]`|
| `parser`      | Split each `.ics` into individual `VEVENT` blocks (text-level)              | ics text → `VEVENT[]`             |
| `transformer` | Prefix each `VEVENT`'s `SUMMARY` with `[label]`; add `CATEGORIES`           | `VEVENT` → `VEVENT'`              |
| `assembler`   | Wrap a clean `VCALENDAR` header/footer; ensure UID uniqueness               | `VEVENT'[]` → ics text            |
| `cache`       | Read/write Cloudflare edge cache (30-min TTL for feed; separate TTL config) | —                                 |
| `handler`     | Orchestrate; set `Content-Type: text/calendar`; build response              | request → response                |

### Data flow

`handler` → check `cache` (hit → return) → `config` loads `sources.json` →
`fetcher` parallel-fetches → per source `parser` → `transformer` adds labels →
`assembler` merges → write `cache` → return.

### Key implementation decisions

- **Text-level parsing, not a full iCal object model.** The parser only isolates
  `BEGIN:VEVENT…END:VEVENT` blocks and rewrites the `SUMMARY` line (handling folded
  lines). Everything else — `DTSTART`/`DTEND`, `VTIMEZONE`, `RRULE` recurrence — is
  preserved verbatim. This is the most robust approach and avoids corrupting source
  timezones or recurring events. No external iCal library needed.
- **UID collision de-conflict.** When merging multiple sources, colliding `UID`s cause
  calendar clients to drop events. The `assembler` prefixes each `UID` with its source
  label to guarantee uniqueness.

## Error Handling

- **Single source fails/times out** → skip it, merge the rest, and insert a visible
  all-day event `⚠️ [SourceX] temporarily unavailable` so the failure is noticeable
  without breaking the whole feed.
- **All sources fail** → if a cached body exists, serve it (stale-while-error);
  otherwise return `502`.
- **`sources.json` fails to load** → use last-cached source list; if none, `502`.
- **Per-source fetch timeout:** 10 seconds.

## Testing

- Unit tests for `parser` / `transformer` / `assembler` against sample `.ics` fixtures,
  comparing output. Framework: **Vitest** (Cloudflare's recommended test runner).
- **Merge-correctness test:** two fixtures with colliding `UID`s → assert both events
  survive in the output and UIDs no longer collide.
- **Folded-line / VTIMEZONE preservation test:** assert timezone blocks and recurrence
  rules pass through unchanged.
- **Post-deploy manual verification:** `curl` the Worker URL to confirm
  `Content-Type: text/calendar` and a valid `VCALENDAR`; then actually subscribe once
  in Google Calendar ("From URL") to confirm events display.

## Tech Stack

Cloudflare Workers + Wrangler CLI + Vitest. Plain TypeScript, no external iCal library
(text-level processing keeps dependencies minimal).

## Capacity Note

Subscriber count is not the bottleneck. With a 30-minute cache, upstream sources are hit
at most ~48 times/day independent of how many people subscribe. Cloudflare's free tier
allows 100,000 requests/day; ~60 subscribers generate on the order of 100 requests/day.
The architecture handles 60 or 600 subscribers identically. The only real constraint is
upstream sources rate-limiting frequent fetches — which the cache exists to prevent.
