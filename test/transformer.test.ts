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
