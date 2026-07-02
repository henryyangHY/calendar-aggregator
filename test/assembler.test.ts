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

  it('advertises a refresh interval so compliant clients poll faster', () => {
    const out = assemble([ev('a', 'One')], []);
    expect(out).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT30M');
    expect(out).toContain('X-PUBLISHED-TTL:PT30M');
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
