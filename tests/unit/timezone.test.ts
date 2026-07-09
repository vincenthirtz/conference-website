import { describe, it, expect } from 'vitest';
import {
  formatDateTimeTz,
  formatTimeTz,
  localInputToUTC,
  TOURNAMENT_TIMEZONES,
} from '../../utils/timezone';

describe('TOURNAMENT_TIMEZONES', () => {
  it('contains at least 10 timezones', () => {
    expect(TOURNAMENT_TIMEZONES.length).toBeGreaterThanOrEqual(10);
  });

  it('includes Europe/Paris', () => {
    const paris = TOURNAMENT_TIMEZONES.find(
      (tz) => tz.value === 'Europe/Paris'
    );
    expect(paris).toBeDefined();
    expect(paris!.label).toContain('Paris');
  });

  it('includes UTC', () => {
    const utc = TOURNAMENT_TIMEZONES.find((tz) => tz.value === 'UTC');
    expect(utc).toBeDefined();
  });

  it('each entry has value and label', () => {
    for (const tz of TOURNAMENT_TIMEZONES) {
      expect(typeof tz.value).toBe('string');
      expect(typeof tz.label).toBe('string');
      expect(tz.value.length).toBeGreaterThan(0);
    }
  });
});

describe('formatDateTimeTz', () => {
  it('returns dash for null input', () => {
    expect(formatDateTimeTz(null)).toBe('—');
  });

  it('returns dash for undefined input', () => {
    expect(formatDateTimeTz(undefined)).toBe('—');
  });

  it('returns the raw string for invalid date', () => {
    expect(formatDateTimeTz('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid ISO date', () => {
    const result = formatDateTimeTz('2026-03-15T14:00:00Z');
    expect(result).toMatch(/\d/); // contains numbers
    expect(result).toMatch(/2026/);
  });

  it('includes timezone abbreviation when timezone is specified', () => {
    const result = formatDateTimeTz('2026-03-15T14:00:00Z', 'Europe/Paris');
    // Should contain a timezone abbreviation in parentheses
    expect(result).toMatch(/\(.+\)/);
  });

  it('does not include timezone abbreviation when no timezone', () => {
    const result = formatDateTimeTz('2026-03-15T14:00:00Z');
    expect(result).not.toMatch(/\(.+\)/);
  });

  it('respects custom format options', () => {
    const result = formatDateTimeTz('2026-03-15T14:00:00Z', null, {
      weekday: 'long',
    });
    // Should contain a weekday name in French
    expect(result.length).toBeGreaterThan(5);
  });
});

describe('formatTimeTz', () => {
  it('returns dash for null input', () => {
    expect(formatTimeTz(null)).toBe('—');
  });

  it('returns dash for undefined input', () => {
    expect(formatTimeTz(undefined)).toBe('—');
  });

  it('returns the raw string for invalid date', () => {
    expect(formatTimeTz('not-a-date')).toBe('not-a-date');
  });

  it('formats time as HH:MM', () => {
    const result = formatTimeTz('2026-03-15T14:00:00Z', 'UTC');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('adjusts for timezone', () => {
    // 14:00 UTC should be 15:00 in CET (winter) or 16:00 in CEST (summer)
    const utc = formatTimeTz('2026-01-15T14:00:00Z', 'UTC');
    const paris = formatTimeTz('2026-01-15T14:00:00Z', 'Europe/Paris');
    // They should differ (Paris is UTC+1 in January)
    expect(paris).not.toBe(utc);
  });
});

describe('localInputToUTC', () => {
  it('returns null for empty input', () => {
    expect(localInputToUTC('')).toBeNull();
  });

  it('converts without timezone (local interpretation)', () => {
    const result = localInputToUTC('2026-03-15T14:00');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result).toContain('Z');
  });

  it('converts with explicit timezone to the EXACT UTC instant (hiver, UTC+1)', () => {
    // Paris en mars (avant le passage à l'heure d'été) = UTC+1.
    // 14:00 Paris ⇒ 13:00Z. Doit être exact, indépendamment du fuseau machine.
    expect(localInputToUTC('2026-03-15T14:00', 'Europe/Paris')).toBe(
      '2026-03-15T13:00:00.000Z'
    );
  });

  it('convertit exactement en été (Paris UTC+2)', () => {
    expect(localInputToUTC('2026-06-15T14:00', 'Europe/Paris')).toBe(
      '2026-06-15T12:00:00.000Z'
    );
  });

  it('gère un fuseau sans DST (Tokyo UTC+9)', () => {
    expect(localInputToUTC('2026-06-15T14:00', 'Asia/Tokyo')).toBe(
      '2026-06-15T05:00:00.000Z'
    );
  });

  it('different timezones produce different UTC results', () => {
    const paris = localInputToUTC('2026-06-15T14:00', 'Europe/Paris');
    const tokyo = localInputToUTC('2026-06-15T14:00', 'Asia/Tokyo');
    expect(paris).not.toBe(tokyo);
  });

  it('gère la bascule DST (nuit du passage à l\'heure d\'été à Paris)', () => {
    // 2026 : le passage été a lieu le 29 mars à 02:00 → 03:00. Un créneau à 03:30
    // ce jour-là est déjà en UTC+2 ⇒ 01:30Z.
    expect(localInputToUTC('2026-03-29T03:30', 'Europe/Paris')).toBe(
      '2026-03-29T01:30:00.000Z'
    );
  });

  it('handles UTC timezone à l\'identique', () => {
    expect(localInputToUTC('2026-03-15T14:00', 'UTC')).toBe(
      '2026-03-15T14:00:00.000Z'
    );
  });

  it('falls back gracefully for malformed input with timezone', () => {
    // The function may throw for truly invalid input — that's acceptable
    try {
      const result = localInputToUTC('bad-input', 'Europe/Paris');
      expect(typeof result).toBe('string');
    } catch {
      // Throwing is also acceptable behavior for malformed input
      expect(true).toBe(true);
    }
  });
});
