import { describe, it, expect } from 'vitest';
import { buildScrimIcs } from '../../utils/teams/scrimIcs';

describe('buildScrimIcs', () => {
  const ics = buildScrimIcs({
    uid: 'plan-1@owwomenscup.fr',
    title: 'Scrim : Phoenix vs Dragons',
    startIso: '2026-08-02T18:00:00.000Z',
    durationMinutes: 120,
    description: 'Grille validée',
    url: 'https://owwomenscup.fr/player/scrim-planning/plan-1',
    nowIso: '2026-08-01T12:00:00.000Z',
  });

  it('encapsule un VEVENT dans un VCALENDAR', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('formate DTSTART/DTEND en UTC compact et calcule la fin (+2h)', () => {
    expect(ics).toContain('DTSTART:20260802T180000Z');
    expect(ics).toContain('DTEND:20260802T200000Z');
    expect(ics).toContain('DTSTAMP:20260801T120000Z');
  });

  it('échappe la virgule dans le SUMMARY (RFC 5545)', () => {
    const e = buildScrimIcs({
      uid: 'u',
      title: 'A, B; C',
      startIso: '2026-08-02T18:00:00.000Z',
      nowIso: '2026-08-01T12:00:00.000Z',
    });
    expect(e).toContain('SUMMARY:A\\, B\\; C');
  });

  it('utilise CRLF entre les lignes', () => {
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('durée par défaut = 120 min', () => {
    const e = buildScrimIcs({
      uid: 'u',
      title: 'x',
      startIso: '2026-08-02T18:00:00.000Z',
      nowIso: '2026-08-01T12:00:00.000Z',
    });
    expect(e).toContain('DTEND:20260802T200000Z');
  });
});
