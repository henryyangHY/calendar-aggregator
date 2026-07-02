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

  it('includes DTEND set to the day after today', () => {
    const out = unavailableEvent('Partiful');
    expect(out).toMatch(/DTEND;VALUE=DATE:\d{8}/);
    // DTEND must appear after DTSTART
    const dtstart = out.indexOf('DTSTART;VALUE=DATE:');
    const dtend = out.indexOf('DTEND;VALUE=DATE:');
    expect(dtend).toBeGreaterThan(dtstart);
  });
});
