import { describe, it, expect } from 'vitest';
import {
  addDaysYmd,
  mondayOf,
  weekDaysFrom,
  dateAndMinuteInTz,
  zonedTimeToUtcIso,
  localInputValue,
  assignLanes,
} from '../../utils/teams/scrimCalendar';

describe('scrimCalendar geometry', () => {
  it('addDaysYmd traverse les fins de mois', () => {
    expect(addDaysYmd('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysYmd('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('mondayOf renvoie le lundi (2026-07-08 = mercredi → 2026-07-06)', () => {
    expect(mondayOf('2026-07-08')).toBe('2026-07-06');
    // un lundi reste lui-même
    expect(mondayOf('2026-07-06')).toBe('2026-07-06');
    // un dimanche → lundi précédent
    expect(mondayOf('2026-07-12')).toBe('2026-07-06');
  });

  it('weekDaysFrom renvoie 7 jours consécutifs', () => {
    expect(weekDaysFrom('2026-07-06')).toEqual([
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
  });

  it('zonedTimeToUtcIso : 20h Paris (été) → 18:00Z', () => {
    expect(zonedTimeToUtcIso('2026-07-10', 20 * 60, 'Europe/Paris')).toBe(
      '2026-07-10T18:00:00.000Z'
    );
  });

  it('zonedTimeToUtcIso : 20h Paris (hiver) → 19:00Z', () => {
    expect(zonedTimeToUtcIso('2026-01-10', 20 * 60, 'Europe/Paris')).toBe(
      '2026-01-10T19:00:00.000Z'
    );
  });

  it('dateAndMinuteInTz inverse zonedTimeToUtcIso', () => {
    const iso = zonedTimeToUtcIso('2026-07-10', 20 * 60, 'Europe/Paris');
    expect(dateAndMinuteInTz(iso, 'Europe/Paris')).toEqual({
      ymd: '2026-07-10',
      minute: 20 * 60,
    });
  });

  it('localInputValue formate en datetime-local', () => {
    expect(localInputValue('2026-07-10', 20 * 60 + 30)).toBe('2026-07-10T20:30');
  });
});

describe('assignLanes (layout anti-collision)', () => {
  it('des blocs disjoints partagent tous la colonne 0 (pleine largeur)', () => {
    const lanes = assignLanes([
      { id: 'a', start: 600, end: 660 },
      { id: 'b', start: 720, end: 780 },
    ]);
    expect(lanes.get('a')).toEqual({ col: 0, cols: 1 });
    expect(lanes.get('b')).toEqual({ col: 0, cols: 1 });
  });

  it('deux blocs qui se chevauchent sont en colonnes 0 et 1 (moitié chacun)', () => {
    const lanes = assignLanes([
      { id: 'a', start: 600, end: 720 },
      { id: 'b', start: 660, end: 780 },
    ]);
    expect(lanes.get('a')).toEqual({ col: 0, cols: 2 });
    expect(lanes.get('b')).toEqual({ col: 1, cols: 2 });
  });

  it('des blocs bord à bord (end === start) ne se chevauchent pas', () => {
    const lanes = assignLanes([
      { id: 'a', start: 600, end: 660 },
      { id: 'b', start: 660, end: 720 },
    ]);
    expect(lanes.get('a')).toEqual({ col: 0, cols: 1 });
    expect(lanes.get('b')).toEqual({ col: 0, cols: 1 });
  });

  it('réutilise une colonne libérée dans un cluster (A|B chevauchent, C réutilise la colonne de A)', () => {
    // A: 0-120, B: 60-180 (chevauche A → col 1), C: 130-200 (après A, réutilise col 0)
    const lanes = assignLanes([
      { id: 'A', start: 0, end: 120 },
      { id: 'B', start: 60, end: 180 },
      { id: 'C', start: 130, end: 200 },
    ]);
    // A, B, C forment un cluster (B chevauche A, C chevauche B) → cols = 2
    expect(lanes.get('A')).toEqual({ col: 0, cols: 2 });
    expect(lanes.get('B')).toEqual({ col: 1, cols: 2 });
    expect(lanes.get('C')).toEqual({ col: 0, cols: 2 });
  });

  it('sépare deux clusters indépendants', () => {
    const lanes = assignLanes([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
      { id: 'c', start: 200, end: 260 },
      { id: 'd', start: 230, end: 290 },
    ]);
    expect(lanes.get('a')).toEqual({ col: 0, cols: 2 });
    expect(lanes.get('b')).toEqual({ col: 1, cols: 2 });
    expect(lanes.get('c')).toEqual({ col: 0, cols: 2 });
    expect(lanes.get('d')).toEqual({ col: 1, cols: 2 });
  });
});
