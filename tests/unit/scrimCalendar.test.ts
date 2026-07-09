import { describe, it, expect } from 'vitest';
import {
  addDaysYmd,
  mondayOf,
  weekDaysFrom,
  dateAndMinuteInTz,
  zonedTimeToUtcIso,
  localInputValue,
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
