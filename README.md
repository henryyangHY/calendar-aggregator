# Calendar Aggregator

A Cloudflare Worker that merges multiple `.ics` calendar feeds into one labelled
calendar, served at a single public URL for classmates to subscribe to.

## Subscribe

Add this URL in Google/Apple Calendar as a "from URL" subscription:

```
https://calendar-aggregator.henryyang-mmm.workers.dev/all.ics
```

Every event is prefixed with its source, e.g. `[CampusGroups] …`, `[Partiful] …`.

## Add or remove a source (no redeploy)

Edit `sources.json` in the sources repo —
[henryyangHY/calendar-aggregator-sources](https://github.com/henryyangHY/calendar-aggregator-sources) —
via the GitHub web editor and save. Each entry:

```json
{ "url": "https://…/feed.ics", "label": "Shown as [label]", "category": "Grouping" }
```

Use `https://` (not `webcal://`). Changes take effect within ~30 minutes (the edge-cache TTL).

## Develop

- `npm install`
- `npm test` — run the Vitest suite (27 tests)
- `npm run dev` — local Worker (reads `SOURCES_URL` from `wrangler.toml`)
- `npm run deploy` — publish to Cloudflare

## How it works

On each cache-miss the Worker reads `sources.json`, parallel-fetches every feed
(10 s timeout, failures isolated), prefixes each event's `SUMMARY`/`UID` with its
source label while preserving timezones and recurrence rules verbatim, reassembles
one `VCALENDAR`, and caches it for 30 minutes. If a single source is down it is
replaced with a visible "temporarily unavailable" placeholder; if every source is
down the Worker returns 502 so subscribers keep their last good sync.

Subscriber count is not a scaling factor: upstream feeds are fetched at most
~48×/day regardless of how many people subscribe.

## Architecture

```
src/config.ts       load + validate remote sources.json (stale fallback)
src/fetcher.ts      parallel fetch, per-source timeout, failure isolation
src/parser.ts       split .ics into VEVENT / VTIMEZONE blocks (verbatim)
src/transformer.ts  prefix SUMMARY/UID with [label], add CATEGORIES
src/assembler.ts    wrap one VCALENDAR, de-dup UID + TZID
src/placeholder.ts  "temporarily unavailable" event for a dead source
src/feed.ts         orchestration
src/cache.ts        30-minute edge cache
src/index.ts        request handler
```
