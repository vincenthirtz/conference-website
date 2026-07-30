import { describe, expect, it } from 'vitest';

import {
  MATCH_FILTER_THRESHOLD,
  bestOfFromMatch,
  buildSceneDataFromMatch,
  filterMatches,
  mapResultsFromGames,
  matchOptionLabel,
  matchScoreChanged,
  matchSearchHaystack,
  matchStatusGlyph,
  matchTimeLabel,
  normalizeSearch,
  teamLabel,
} from '@/utils/caster/matchPickerFormat';
import type { CasterApiMatch } from '@/types/caster';

/** Match de test minimal — surchargé par cas. */
function makeMatch(over: Partial<CasterApiMatch> = {}): CasterApiMatch {
  return {
    id: 'm1',
    status: 'pending',
    best_of: null,
    match_format: null,
    scheduled_at: null,
    team1_score: null,
    team2_score: null,
    round_name: null,
    stream_url: null,
    team1: {
      id: 't1',
      name: 'Percevál',
      short_name: 'PERC',
      logo_url: 'https://x/1.png',
    },
    team2: {
      id: 't2',
      name: 'Karadoc',
      short_name: 'KARA',
      logo_url: 'https://x/2.png',
    },
    ...over,
  };
}

describe('matchStatusGlyph', () => {
  it('un glyphe par statut, horloge par défaut', () => {
    expect(matchStatusGlyph('ongoing')).toBe('🔴 ');
    expect(matchStatusGlyph('finished')).toBe('✓ ');
    expect(matchStatusGlyph('pending')).toBe('◷ ');
    expect(matchStatusGlyph(null)).toBe('◷ ');
  });
});

describe('bestOfFromMatch', () => {
  it('la colonne explicite gagne', () => {
    expect(bestOfFromMatch({ best_of: 3, match_format: 'bo7' })).toBe(3);
  });

  it('retombe sur le premier entier de match_format', () => {
    expect(bestOfFromMatch({ best_of: null, match_format: 'BO7' })).toBe(7);
    expect(bestOfFromMatch({ best_of: null, match_format: 'bo3' })).toBe(3);
  });

  it('BO5 par défaut quand rien n’est exploitable', () => {
    expect(bestOfFromMatch({ best_of: null, match_format: null })).toBe(5);
    expect(bestOfFromMatch({ best_of: null, match_format: 'best of' })).toBe(5);
  });
});

describe('normalizeSearch', () => {
  it('minuscule et retire les accents', () => {
    expect(normalizeSearch('Percevál')).toBe('perceval');
    expect(normalizeSearch('ÉLODIE')).toBe('elodie');
    expect(normalizeSearch(null)).toBe('');
  });
});

describe('teamLabel', () => {
  it('short_name > name > repli', () => {
    expect(
      teamLabel({
        id: 'a',
        name: 'Percevál',
        short_name: 'PERC',
        logo_url: null,
      })
    ).toBe('PERC');
    expect(
      teamLabel({ id: 'a', name: 'Percevál', short_name: null, logo_url: null })
    ).toBe('Percevál');
    expect(teamLabel(null)).toBe('TBD');
    expect(teamLabel(undefined, '—')).toBe('—');
  });
});

describe('matchTimeLabel', () => {
  it('affiche le créneau des matchs à venir', () => {
    const label = matchTimeLabel({
      status: 'pending',
      scheduled_at: '2026-07-12T18:30:00.000Z',
    });
    // Format dépendant du fuseau de la machine : on valide la forme, pas la valeur.
    expect(label).toMatch(/^\d{2}\/\d{2}.*\d{2}:\d{2}$/);
  });

  it('masqué pour un match live ou terminé (le score est le signal)', () => {
    expect(
      matchTimeLabel({
        status: 'ongoing',
        scheduled_at: '2026-07-12T18:30:00.000Z',
      })
    ).toBe('');
    expect(
      matchTimeLabel({
        status: 'finished',
        scheduled_at: '2026-07-12T18:30:00.000Z',
      })
    ).toBe('');
  });

  it('masqué sans créneau ou sur date invalide', () => {
    expect(matchTimeLabel({ status: 'pending', scheduled_at: null })).toBe('');
    expect(
      matchTimeLabel({ status: 'pending', scheduled_at: 'pas-une-date' })
    ).toBe('');
  });
});

describe('matchOptionLabel', () => {
  it('match live : glyphe + score, pas de créneau', () => {
    const label = matchOptionLabel(
      makeMatch({
        status: 'ongoing',
        team1_score: 1,
        team2_score: 2,
        round_name: 'Demi-finale',
        scheduled_at: '2026-07-12T18:30:00.000Z',
      })
    );
    expect(label).toBe('🔴 PERC vs KARA (1-2) — Demi-finale');
  });

  it('match à venir : pas de score, créneau affiché', () => {
    const label = matchOptionLabel(
      makeMatch({ status: 'pending', scheduled_at: '2026-07-12T18:30:00.000Z' })
    );
    expect(label).toMatch(/^◷ PERC vs KARA · \d{2}\/\d{2}/);
    expect(label).not.toContain('(');
  });

  it('équipes non déterminées → repli TBD paramétrable', () => {
    const label = matchOptionLabel(makeMatch({ team1: null, team2: null }));
    expect(label).toBe('◷ TBD vs TBD');
  });
});

describe('matchSearchHaystack / filterMatches', () => {
  it('la botte de foin couvre noms longs, noms courts et tour', () => {
    const hay = matchSearchHaystack(
      makeMatch({ round_name: 'Quart de finale' })
    );
    expect(hay).toContain('perceval');
    expect(hay).toContain('perc');
    expect(hay).toContain('quart de finale');
  });

  it('filtre accent-insensiblement', () => {
    const list = [
      makeMatch({ id: 'a' }),
      makeMatch({
        id: 'b',
        team1: {
          id: 'x',
          name: 'Guenièvre',
          short_name: 'GUEN',
          logo_url: null,
        },
        team2: {
          id: 'y',
          name: 'Léodagan',
          short_name: 'LEOD',
          logo_url: null,
        },
      }),
    ];
    expect(filterMatches(list, 'perceval').map((m) => m.id)).toEqual(['a']);
    expect(filterMatches(list, 'GUENIEVRE').map((m) => m.id)).toEqual(['b']);
    expect(filterMatches(list, '   ').map((m) => m.id)).toEqual(['a', 'b']);
    expect(filterMatches(list, 'lancelot')).toEqual([]);
  });

  it('le seuil d’apparition de la recherche reste celui du desktop', () => {
    expect(MATCH_FILTER_THRESHOLD).toBe(8);
  });
});

describe('mapResultsFromGames', () => {
  it('garde les maps réellement jouées', () => {
    expect(
      mapResultsFromGames([
        {
          id: 'g1',
          map_name: 'Ilios',
          map_order: 1,
          team1_score: 1,
          team2_score: 0,
        },
        {
          id: 'g2',
          map_name: 'Hollywood',
          map_order: 2,
          team1_score: 0,
          team2_score: 1,
        },
        // Map non jouée (pas de nom, pas de score) → ignorée.
        {
          id: 'g3',
          map_name: null,
          map_order: 3,
          team1_score: 0,
          team2_score: 0,
        },
      ])
    ).toEqual([
      { map: 'Ilios', score1: 1, score2: 0 },
      { map: 'Hollywood', score1: 0, score2: 1 },
    ]);
  });

  it('tolère l’absence de games', () => {
    expect(mapResultsFromGames(null)).toEqual([]);
    expect(mapResultsFromGames(undefined)).toEqual([]);
  });
});

describe('buildSceneDataFromMatch', () => {
  const match = makeMatch({
    status: 'ongoing',
    team1_score: 2,
    team2_score: 1,
    match_format: 'bo5',
  });
  const games = [
    {
      id: 'g1',
      map_name: 'Ilios',
      map_order: 1,
      team1_score: 1,
      team2_score: 0,
    },
    {
      id: 'g2',
      map_name: 'Hollywood',
      map_order: 2,
      team1_score: 0,
      team2_score: 1,
    },
  ];

  it('scène match : équipes/logos/score/format + map courante, bans remis à zéro', () => {
    const data = buildSceneDataFromMatch({
      sceneType: 'match',
      prev: {
        casters: ['Alpha', 'Bravo'],
        hashtag: '#WomensCup',
        ban1: { key: 'ana', name: 'Ana', portrait: 'p' },
        seriesDots: false,
      },
      match,
      games,
    });

    expect(data).toMatchObject({
      team1: 'PERC',
      team2: 'KARA',
      score1: 2,
      score2: 1,
      team1Logo: 'https://x/1.png',
      team2Logo: 'https://x/2.png',
      matchId: 'm1',
      map: 'Ilios',
      bestOf: 5,
      ban1: null,
      ban2: null,
    });
    // Contexte saisi par le caster : préservé.
    expect(data.casters).toEqual(['Alpha', 'Bravo']);
    expect(data.hashtag).toBe('#WomensCup');
    expect(data.seriesDots).toBe(false);
  });

  it('scène results : détail par map auto-rempli depuis les games', () => {
    const data = buildSceneDataFromMatch({
      sceneType: 'results',
      prev: { mvp: 'Perceval', socials: { twitch: 'twitch.tv/womens_cup' } },
      match,
      games,
    });

    expect(data.mapResults).toEqual([
      { map: 'Ilios', score1: 1, score2: 0 },
      { map: 'Hollywood', score1: 0, score2: 1 },
    ]);
    expect(data.bestOf).toBe(5);
    expect(data.mvp).toBe('Perceval');
    expect(data.socials).toEqual({ twitch: 'twitch.tv/womens_cup' });
    // La scène results n'a pas de champ `map` ni de bans.
    expect(data.map).toBeUndefined();
    expect('ban1' in data).toBe(false);
  });

  it('data précédente absente → payload complet quand même', () => {
    const data = buildSceneDataFromMatch({
      sceneType: 'match',
      prev: null,
      match,
      games: [],
    });
    expect(data.matchId).toBe('m1');
    expect(data.map).toBe('');
  });
});

describe('matchScoreChanged', () => {
  it('vrai au premier passage', () => {
    expect(matchScoreChanged(null, makeMatch())).toBe(true);
  });

  it('détecte un score ou un statut qui bouge', () => {
    const prev = makeMatch({
      team1_score: 1,
      team2_score: 0,
      status: 'ongoing',
    });
    expect(
      matchScoreChanged(
        prev,
        makeMatch({ team1_score: 2, team2_score: 0, status: 'ongoing' })
      )
    ).toBe(true);
    expect(
      matchScoreChanged(
        prev,
        makeMatch({ team1_score: 1, team2_score: 0, status: 'finished' })
      )
    ).toBe(true);
  });

  it('faux quand rien n’a bougé (aucune écriture inutile)', () => {
    const prev = makeMatch({
      team1_score: 1,
      team2_score: 0,
      status: 'ongoing',
    });
    const next = makeMatch({
      team1_score: 1,
      team2_score: 0,
      status: 'ongoing',
    });
    expect(matchScoreChanged(prev, next)).toBe(false);
  });

  it('null et 0 sont équivalents (colonnes nullables)', () => {
    const prev = makeMatch({ team1_score: null, team2_score: null });
    const next = makeMatch({ team1_score: 0, team2_score: 0 });
    expect(matchScoreChanged(prev, next)).toBe(false);
  });
});
