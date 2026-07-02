# CLAUDE.md — Calendar Aggregator (agent maintenance runbook)

> Read this when Henry asks to **add / remove / rename / adjust a calendar** in his
> aggregated calendar. It tells you exactly what to change and how to verify.

## What this is

A Cloudflare Worker that merges several `.ics` feeds into ONE labelled subscription
URL that Henry shares with classmates.

- **Subscribe URL (the thing people subscribe to):** `https://calendar-aggregator.henryyang-mmm.workers.dev/all.ics`
- **Worker code:** this repo — `henryyangHY/calendar-aggregator`
- **Source list you edit to change calendars:** `henryyangHY/calendar-aggregator-sources` → `sources.json`
  (raw: `https://raw.githubusercontent.com/henryyangHY/calendar-aggregator-sources/main/sources.json`)

The Worker reads `sources.json` **live** on each cache-miss and merges the feeds, so
**you never need to touch this code repo or redeploy to change calendars** — just edit
`sources.json`. Changes go live within ~30 minutes (edge-cache TTL).

## When Henry says "add / remove / adjust a calendar"

He means: edit `sources.json` in the **calendar-aggregator-sources** repo. Do this:

### Procedure (works from any directory; needs the `gh` CLI, already authed as henryyangHY)

1. Clone the sources repo into a fresh temp dir (use `mktemp -d`; do NOT `rm -rf` a
   fixed path — that gets blocked in sandboxed sessions):
   ```bash
   DIR=$(mktemp -d /tmp/cal-sources.XXXXXX) && gh repo clone henryyangHY/calendar-aggregator-sources "$DIR"
   ```
2. Edit `"$DIR/sources.json"`. It's `{ "sources": [ ... ] }`; each entry:
   ```json
   { "url": "<https .ics URL>", "label": "<shown as [label] on every event>", "category": "<grouping>" }
   ```
   - **Add** a calendar → append one object to the `sources` array.
   - **Remove** → delete that object.
   - **Rename label / recategorize** → change the field.
3. Rules (do not skip):
   - **URL must be `https://`.** If Henry gives a `webcal://` link, convert it to `https://`
     (same host + path). The Worker's `fetch` cannot use `webcal://`.
   - **Validate JSON** before committing:
     `python3 -c "import json;json.load(open('$DIR/sources.json'));print('ok')"`
   - **Before adding**, sanity-check the feed is reachable and really iCalendar. Use **node
     fetch, not system curl** (macOS system curl / LibreSSL fails TLS on some hosts):
     ```bash
     node -e 'const u=process.argv[1];fetch(u).then(async r=>{const t=await r.text();console.log(r.status,t.slice(0,15),"VEVENT",(t.match(/BEGIN:VEVENT/g)||[]).length)})' "<url>"
     ```
     Expect `200 BEGIN:VCALENDAR` and some VEVENT count (0 can be legit for a new feed).
4. Commit + push to `main` (Henry's cross-agent etiquette: add the co-author trailer):
   ```bash
   cd "$DIR" && git commit -am "sources: <what changed>" && git push
   ```
   Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
5. Verify:
   - `sources.json` updates instantly on the raw URL (curl is fine for the raw GitHub URL).
   - The **merged feed** lags up to 30 min (cache). Confirm with **node fetch** against the
     subscribe URL — check total VEVENT count moved and the new `[label]` appears:
     ```bash
     node -e 'fetch("https://calendar-aggregator.henryyang-mmm.workers.dev/all.ics").then(r=>r.text()).then(t=>{console.log("VEVENT",(t.match(/BEGIN:VEVENT/g)||[]).length);console.log("labels",[...new Set([...t.matchAll(/^SUMMARY[^\r\n]*(\[[^\]]+\])/gm)].map(m=>m[1]))])})'
     ```

## Gotchas (learned during build)

- **Verify with node fetch, never system `curl`** for `*.workers.dev` — old LibreSSL fails the TLS handshake; the Worker is fine.
- **CampusGroups** uses `SUMMARY;ENCODING=QUOTED-PRINTABLE:` (parameterized SUMMARY). The labeler handles it — don't "fix" it.
- A feed with **0 events** (e.g. suMMMer before events are posted) is valid, not a failure.
- All current source feeds emit UTC (`DTSTART:…Z`), so the merged feed has **no VTIMEZONE blocks** — that's expected.
- New `*.workers.dev` subdomains take a few minutes for the TLS cert to provision after first deploy.

## If you ever DO need to change the Worker itself (rare)

Design + plan live under `docs/superpowers/`. Tests: `npm test` (Vitest, 27 tests). Deploy: `npm run deploy` (Wrangler; Henry's Cloudflare account, workers.dev subdomain `henryyang-mmm`).

(by Claude)
