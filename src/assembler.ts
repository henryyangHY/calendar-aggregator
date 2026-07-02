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
    // Refresh hints: compliant clients (Outlook desktop, Apple Calendar) poll at this
    // interval instead of their slower default. Aligned with the 30-min edge-cache TTL.
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
    ...uniqueTz,
    ...uniqueEvents,
    'END:VCALENDAR',
  ];
  return parts.join('\r\n') + '\r\n';
}
