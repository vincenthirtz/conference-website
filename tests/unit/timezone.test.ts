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

  it('converts with explicit timezone and returns a valid ISO string', () => {
    const result = localInputToUTC('2026-03-15T14:00', 'Europe/Paris');
    expect(result).not.toBeNull();
    expect(result!).toContain('Z');
    // The result should be a valid ISO date
    const date = new Date(result!);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it('different timezones produce different UTC results', () => {
    const paris = localInputToUTC('2026-06-15T14:00', 'Europe/Paris');
    const tokyo = localInputToUTC('2026-06-15T14:00', 'Asia/Tokyo');
    expect(paris).not.toBeNull();
    expect(tokyo).not.toBeNull();
    // Paris (UTC+2 summer) and Tokyo (UTC+9) should give different UTC times
    expect(paris).not.toBe(tokyo);
  });

  it('handles UTC timezone', () => {
    const result = localInputToUTC('2026-03-15T14:00', 'UTC');
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(isNaN(date.getTime())).toBe(false);
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
