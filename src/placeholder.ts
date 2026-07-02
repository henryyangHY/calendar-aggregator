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
