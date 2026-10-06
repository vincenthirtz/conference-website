// tests/unit/waitingAge.test.ts — ancienneté d'un élément en attente dans une
// file de traitement (demandes, tickets support) : la puce « en attente depuis
// X h/j » et sa couleur.

import { describe, expect, it } from 'vitest';
import {
  formatWaitingAge,
  WAITING_ERR_HOURS,
  WAITING_WARN_HOURS,
  waitingAge,
} from '../../features/admin/_shared/waitingAge';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const H = 3_600_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const LABELS = {
  lessThanHour: '< 1 h',
  hours: '{count} h',
  days: '{count} j',
};

describe('waitingAge', () => {
  it('rend null pour une date absente ou illisible', () => {
    expect(waitingAge(null, NOW)).toBeNull();
    expect(waitingAge(undefined, NOW)).toBeNull();
    expect(waitingAge('pas une date', NOW)).toBeNull();
  });

  it('compte les heures pleines, jamais négatives', () => {
    expect(waitingAge(iso(30 * 60_000), NOW)).toMatchObject({ hours: 0 });
    expect(waitingAge(iso(5 * H + 59 * 60_000), NOW)).toMatchObject({
      hours: 5,
      days: 0,
    });
    // Horloge du serveur en avance sur le navigateur : pas de « -1 h ».
    expect(waitingAge(iso(-2 * H), NOW)).toMatchObject({ hours: 0 });
  });

  it('passe à l’orange après 24 h, au rouge après 72 h', () => {
    expect(waitingAge(iso((WAITING_WARN_HOURS - 1) * H), NOW)?.tone).toBe('ok');
    expect(waitingAge(iso(WAITING_WARN_HOURS * H), NOW)?.tone).toBe('warn');
    expect(waitingAge(iso((WAITING_ERR_HOURS - 1) * H), NOW)?.tone).toBe(
      'warn'
    );
    expect(waitingAge(iso(WAITING_ERR_HOURS * H), NOW)?.tone).toBe('err');
  });
});

describe('formatWaitingAge', () => {
  it('moins d’une heure, puis des heures, puis des jours', () => {
    const fmt = (ms: number) => {
      const age = waitingAge(iso(ms), NOW);
      return age ? formatWaitingAge(age, LABELS) : null;
    };
    expect(fmt(10 * 60_000)).toBe('< 1 h');
    expect(fmt(3 * H)).toBe('3 h');
    expect(fmt(23 * H)).toBe('23 h');
    expect(fmt(24 * H)).toBe('1 j');
    expect(fmt(4 * 24 * H + 5 * H)).toBe('4 j');
  });
});
