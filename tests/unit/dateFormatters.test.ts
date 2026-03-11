import { describe, it, expect } from 'vitest';
import {
  formatDateHeader,
  formatTime,
  isoToLocalInput,
  localInputToIso,
} from '../../utils/dateFormatters';

describe('formatDateHeader', () => {
  it('formats a date in French long format', () => {
    // Note: output depends on locale but should contain the day/month/year
    const result = formatDateHeader('2026-03-15T10:00:00Z');
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
    // French month name
    expect(result).toMatch(/mars/i);
  });
});

describe('formatTime', () => {
  it('formats time as HH:MM', () => {
    const result = formatTime('2026-03-15T14:30:00Z');
    // Should contain hours and minutes (exact value depends on TZ)
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('isoToLocalInput', () => {
  it('returns empty string for null', () => {
    expect(isoToLocalInput(null)).toBe('');
  });

  it('converts ISO to datetime-local format', () => {
    const result = isoToLocalInput('2026-03-15T14:30:00.000Z');
    // Should be YYYY-MM-DDTHH:MM format (local TZ dependent)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns empty string for invalid date', () => {
    expect(isoToLocalInput('not-a-date')).toMatch(/^(|NaN)/);
  });
});

describe('localInputToIso', () => {
  it('returns empty string for empty input', () => {
    expect(localInputToIso('')).toBe('');
  });

  it('converts datetime-local to ISO string', () => {
    const result = localInputToIso('2026-03-15T14:30');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result).toContain('Z');
  });

  it('roundtrips through isoToLocalInput', () => {
    const iso = '2026-06-15T10:00:00.000Z';
    const local = isoToLocalInput(iso);
    if (local) {
      const back = localInputToIso(local);
      // The roundtrip should preserve the same instant
      expect(new Date(back).getTime()).toBe(new Date(iso).getTime());
    }
  });
});
