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
