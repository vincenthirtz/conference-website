import { describe, expect, it } from 'vitest';
import { formatDateRange } from '@/utils/tournamentDates';

describe('formatDateRange', () => {
  const day = '2026-03-05T00:00:00.000Z';
  const sameDay = '2026-03-05T00:00:00.000Z';
  const later = '2026-03-09T00:00:00.000Z';

  it('single day (start === end)', () => {
    const fr = formatDateRange(day, sameDay, 'fr');
    const en = formatDateRange(day, sameDay, 'en');
    expect(fr).toMatch(/^Le /);
    expect(en).toMatch(/^On /);
    expect(fr).not.toBe(en);
  });

  it('range', () => {
    const fr = formatDateRange(day, later, 'fr');
    const en = formatDateRange(day, later, 'en');
    expect(fr).toMatch(/^Du /);
    expect(fr).toContain(' au ');
    expect(en).toMatch(/^From /);
    expect(en).toContain(' to ');
    expect(fr).not.toBe(en);
  });

  it('open start only (no end)', () => {
    const fr = formatDateRange(day, null, 'fr');
    const en = formatDateRange(day, null, 'en');
    expect(fr).toMatch(/^À partir du /);
    expect(en).toMatch(/^From /);
    expect(fr).not.toBe(en);
  });

  it('open end only (no start)', () => {
    const fr = formatDateRange(null, later, 'fr');
    const en = formatDateRange(null, later, 'en');
    expect(fr).toMatch(/^Jusqu'au /);
    expect(en).toMatch(/^Until /);
    expect(fr).not.toBe(en);
  });

  it('both null → null', () => {
    expect(formatDateRange(null, null, 'fr')).toBeNull();
    expect(formatDateRange(undefined, undefined, 'en')).toBeNull();
  });
});
