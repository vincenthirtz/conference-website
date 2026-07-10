import { describe, it, expect } from 'vitest';
import { fmtHourOfDay, formatInstant } from '../../utils/teams/scrimTime';

describe('fmtHourOfDay', () => {
  it('formate la minute-de-jour en HH:mm (zéro-paddé)', () => {
    expect(fmtHourOfDay(0)).toBe('00:00');
    expect(fmtHourOfDay(60)).toBe('01:00');
    expect(fmtHourOfDay(630)).toBe('10:30');
    expect(fmtHourOfDay(23 * 60 + 30)).toBe('23:30');
    expect(fmtHourOfDay(24 * 60)).toBe('24:00');
  });
});

describe('formatInstant', () => {
  it('renvoie une chaîne vide pour une date invalide', () => {
    expect(formatInstant('pas-une-date')).toBe('');
  });

  it('rend l’instant dans le fuseau demandé (en-GB, 24h)', () => {
    // 18:00Z = 20:00 Europe/Paris (été)
    const out = formatInstant('2026-07-15T18:00:00.000Z', {
      locale: 'en-GB',
      timeZone: 'Europe/Paris',
    });
    expect(out).toContain('20:00');
  });

  it('respecte le fuseau (même instant, heures différentes)', () => {
    const paris = formatInstant('2026-07-15T18:00:00.000Z', {
      locale: 'en-GB',
      timeZone: 'Europe/Paris',
    });
    const ny = formatInstant('2026-07-15T18:00:00.000Z', {
      locale: 'en-GB',
      timeZone: 'America/New_York',
    });
    expect(paris).toContain('20:00');
    expect(ny).toContain('14:00');
  });
});
