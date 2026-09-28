// Requête de l'écran admin des matchs — utils/matches/adminMatchesQuery.ts
//
// Deux régressions constatées en prod (tournoi de 30 matchs) :
//   - la liste suivait l'ordre de CRÉATION, pas l'horaire ;
//   - le calendrier ne montrait que la page courante (25 sur 30).

import { describe, it, expect } from 'vitest';
import {
  CALENDAR_LIMIT,
  buildAdminMatchesQuery,
} from '../../utils/matches/adminMatchesQuery';

const base = {
  limit: 25,
  offset: 50,
  timezone: 'Europe/Paris',
};

function parse(q: string) {
  return Object.fromEntries(new URLSearchParams(q));
}

describe('buildAdminMatchesQuery', () => {
  it('trie par horaire croissant, en liste comme en calendrier', () => {
    for (const view of ['list', 'calendar'] as const) {
      const q = parse(buildAdminMatchesQuery({ ...base, view }));
      expect(q.orderBy).toBe('scheduled_at');
      expect(q.orderDir).toBe('asc');
    }
  });

  it('la liste reste paginée', () => {
    const q = parse(buildAdminMatchesQuery({ ...base, view: 'list' }));
    expect(q.limit).toBe('25');
    expect(q.offset).toBe('50');
  });

  it('le calendrier charge tout le tournoi, depuis le début', () => {
    const q = parse(buildAdminMatchesQuery({ ...base, view: 'calendar' }));
    expect(q.limit).toBe(String(CALENDAR_LIMIT));
    expect(q.offset).toBe('0');
  });

  it('garde les filtres, et omet les vides', () => {
    const q = parse(
      buildAdminMatchesQuery({
        ...base,
        view: 'calendar',
        stageId: 's1',
        status: '',
        search: '  hinode ',
        dateFrom: '2026-10-01',
      })
    );
    expect(q.stageId).toBe('s1');
    expect(q.status).toBeUndefined();
    expect(q.search).toBe('hinode');
    // Minuit à Paris le 1er octobre (UTC+2).
    expect(q.dateFrom).toBe('2026-09-30T22:00:00.000Z');
    expect(q.dateTo).toBeUndefined();
  });
});
