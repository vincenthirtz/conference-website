// Unit tests — progression et jalons (N8), cœur pur.
//
// La règle d'acceptation est « aucun jalon fabriqué ». Ces tests vérifient donc
// surtout que rien n'est inventé :
//
//   - pas de variation sans deux mesures ;
//   - pas de série comptée à travers un résultat inconnu ;
//   - pas de palier annoncé avant d'être franchi ;
//   - et la sparkline garde les DERNIERS points, pas les premiers : elle
//     raconte où l'on va.

import { describe, it, expect } from 'vitest';

import {
  buildRatingSeries,
  buildSparkGeometry,
  computeMilestones,
  currentStreak,
  ENCOUNTER_MILESTONES,
  peakRating,
  ratingDelta,
  SERIES_MAX_POINTS,
  SPARK_HEIGHT,
  SPARK_PADDING,
  SPARK_WIDTH,
  STREAK_MIN_LENGTH,
  type RatingHistoryRow,
} from '../../utils/teams/progression';
import type { PlayedGame } from '../../utils/teams/scouting';

const ME = 'me';
const THEM = 'them';

let seq = 0;
function game(over: Partial<PlayedGame> = {}): PlayedGame {
  seq += 1;
  return {
    subjectType: 'match',
    subjectId: `g${seq}`,
    playedAt: '2026-07-01T20:00:00.000Z',
    team1Id: ME,
    team2Id: THEM,
    team1Score: null,
    team2Score: null,
    winnerTeamId: null,
    ...over,
  };
}

/** Affrontement daté au jour `day` de juillet, gagné ou perdu par MOI. */
function dayGame(day: number, won: boolean): PlayedGame {
  return game({
    playedAt: `2026-07-${String(day).padStart(2, '0')}T20:00:00.000Z`,
    winnerTeamId: won ? ME : THEM,
  });
}

function hist(...entries: Array<[string, number]>): RatingHistoryRow[] {
  return entries.map(([occurredAt, ratingAfter]) => ({
    occurredAt,
    ratingAfter,
  }));
}

describe('buildRatingSeries', () => {
  it('ordonne chronologiquement quel que soit l’ordre d’entrée', () => {
    const series = buildRatingSeries(
      hist(
        ['2026-07-10T00:00:00.000Z', 1520],
        ['2026-07-01T00:00:00.000Z', 1500],
        ['2026-07-05T00:00:00.000Z', 1510]
      )
    );
    expect(series.map((p) => p.rating)).toEqual([1500, 1510, 1520]);
  });

  it('garde les DERNIERS points quand la série déborde', () => {
    // Une sparkline raconte où l'on va, pas d'où l'on vient.
    const entries: Array<[string, number]> = Array.from(
      { length: SERIES_MAX_POINTS + 5 },
      (_, i) => [
        `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        1500 + i,
      ]
    );
    const series = buildRatingSeries(hist(...entries));
    expect(series).toHaveLength(SERIES_MAX_POINTS);
    expect(series[series.length - 1].rating).toBe(1500 + SERIES_MAX_POINTS + 4);
  });

  it('ignore les lignes sans date ou sans niveau exploitable', () => {
    const series = buildRatingSeries([
      { occurredAt: null, ratingAfter: 1500 },
      { occurredAt: 'pas-une-date', ratingAfter: 1500 },
      { occurredAt: '2026-07-01T00:00:00.000Z', ratingAfter: null },
      { occurredAt: '2026-07-02T00:00:00.000Z', ratingAfter: 1510 },
    ]);
    expect(series).toHaveLength(1);
  });
});

describe('ratingDelta', () => {
  it('mesure du premier au dernier point de la série affichée', () => {
    const series = buildRatingSeries(
      hist(
        ['2026-07-01T00:00:00.000Z', 1500],
        ['2026-07-05T00:00:00.000Z', 1540]
      )
    );
    expect(ratingDelta(series)).toBe(40);
  });

  it('refuse de conclure sous deux mesures', () => {
    // « 0 » se lirait comme « n'a pas bougé » — ce n'est pas ce qu'on sait.
    expect(ratingDelta([])).toBeNull();
    expect(
      ratingDelta(buildRatingSeries(hist(['2026-07-01T00:00:00.000Z', 1500])))
    ).toBeNull();
  });
});

describe('peakRating', () => {
  it('prend le maximum de l’historique et du niveau courant', () => {
    const history = hist(
      ['2026-07-01T00:00:00.000Z', 1500],
      ['2026-07-05T00:00:00.000Z', 1560],
      ['2026-07-09T00:00:00.000Z', 1520]
    );
    expect(peakRating(history, 1520)).toBe(1560);
    // Le courant peut dépasser l'historique lu (fenêtre, recalcul…).
    expect(peakRating(history, 1600)).toBe(1600);
  });

  it('renvoie null si rien n’a jamais été noté', () => {
    expect(peakRating([], null)).toBeNull();
  });
});

describe('currentStreak', () => {
  it('compte la série en cours depuis le dernier affrontement', () => {
    const games = [
      dayGame(1, false),
      dayGame(5, true),
      dayGame(9, true),
      dayGame(12, true),
    ];
    expect(currentStreak(games, ME)).toEqual({ type: 'win', length: 3 });
  });

  it('se tait sous le seuil de longueur', () => {
    const games = [dayGame(1, false), dayGame(5, true), dayGame(9, true)];
    expect(currentStreak(games, ME)).toBeNull();
  });

  it('s’interrompt sur un résultat inconnu au lieu de le traverser', () => {
    // Compter « à travers » une issue inconnue fabriquerait un fait.
    const games = [
      dayGame(1, true),
      dayGame(5, true),
      game({ playedAt: '2026-07-09T20:00:00.000Z' }), // ni vainqueur ni score
      dayGame(12, true),
    ];
    expect(currentStreak(games, ME)).toBeNull();
  });

  it('lit la série du bon côté', () => {
    const games = [dayGame(1, true), dayGame(5, true), dayGame(9, true)];
    expect(currentStreak(games, ME)).toEqual({ type: 'win', length: 3 });
    expect(currentStreak(games, THEM)).toEqual({
      type: 'loss',
      length: STREAK_MIN_LENGTH,
    });
  });
});

describe('computeMilestones', () => {
  it('ne produit rien sans affrontement ni notation', () => {
    expect(
      computeMilestones({
        games: [],
        teamId: ME,
        history: [],
        currentRating: null,
      })
    ).toEqual([]);
  });

  it('date le premier affrontement et la première victoire', () => {
    const games = [dayGame(9, true), dayGame(1, false), dayGame(5, true)];
    const milestones = computeMilestones({
      games,
      teamId: ME,
      history: [],
      currentRating: null,
    });
    expect(milestones.find((m) => m.code === 'first_encounter')?.at).toBe(
      '2026-07-01T20:00:00.000Z'
    );
    expect(milestones.find((m) => m.code === 'first_win')?.at).toBe(
      '2026-07-05T20:00:00.000Z'
    );
  });

  it('n’annonce pas un palier non franchi', () => {
    const [firstThreshold] = ENCOUNTER_MILESTONES;
    const games = Array.from({ length: firstThreshold - 1 }, (_, i) =>
      dayGame(i + 1, true)
    );
    const milestones = computeMilestones({
      games,
      teamId: ME,
      history: [],
      currentRating: null,
    });
    expect(milestones.some((m) => m.code === 'encounters_reached')).toBe(false);
  });

  it('ne retient que le palier le plus élevé franchi', () => {
    const games = Array.from({ length: 26 }, (_, i) =>
      dayGame((i % 28) + 1, true)
    );
    const milestones = computeMilestones({
      games,
      teamId: ME,
      history: [],
      currentRating: null,
    });
    const reached = milestones.filter((m) => m.code === 'encounters_reached');
    expect(reached).toHaveLength(1);
    expect(reached[0].value).toBe(25);
  });

  it('porte la série avec son sens', () => {
    const games = [dayGame(1, false), dayGame(5, false), dayGame(9, false)];
    const milestones = computeMilestones({
      games,
      teamId: ME,
      history: [],
      currentRating: null,
    });
    expect(milestones.find((m) => m.code === 'streak')).toMatchObject({
      value: 3,
      streakType: 'loss',
    });
  });

  it('n’ajoute le meilleur niveau que s’il a été mesuré', () => {
    const withoutRating = computeMilestones({
      games: [dayGame(1, true)],
      teamId: ME,
      history: [],
      currentRating: null,
    });
    expect(withoutRating.some((m) => m.code === 'peak_rating')).toBe(false);

    const withRating = computeMilestones({
      games: [dayGame(1, true)],
      teamId: ME,
      history: hist(['2026-07-01T00:00:00.000Z', 1540]),
      currentRating: 1520,
    });
    expect(withRating.find((m) => m.code === 'peak_rating')?.value).toBe(1540);
  });
});

describe('buildSparkGeometry', () => {
  const series = (...ratings: number[]) =>
    ratings.map((rating, i) => ({
      at: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      rating,
    }));

  it('se tait sous le seuil de points', () => {
    expect(buildSparkGeometry(series(1500, 1510))).toBeNull();
  });

  it('inverse l’axe Y : le meilleur niveau est en HAUT', () => {
    // Le mode d'échec redouté d'un graphique : il ne lève rien, il dessine
    // simplement une courbe fausse. Ce test le rend visible.
    const geo = buildSparkGeometry(series(1500, 1540, 1520))!;
    const [low, high, mid] = geo.points;
    expect(high.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(low.y);
  });

  it('colle les extrêmes aux bords utiles de la boîte', () => {
    const geo = buildSparkGeometry(series(1500, 1520, 1540))!;
    expect(geo.points[0].y).toBe(SPARK_HEIGHT - SPARK_PADDING);
    expect(geo.points[2].y).toBe(SPARK_PADDING);
    expect(geo.points[0].x).toBe(SPARK_PADDING);
    expect(geo.points[2].x).toBe(SPARK_WIDTH - SPARK_PADDING);
  });

  it('centre verticalement une série plate', () => {
    // Collée en haut, un niveau stable se lirait comme un plafond atteint.
    const geo = buildSparkGeometry(series(1500, 1500, 1500))!;
    const middle = SPARK_HEIGHT / 2;
    for (const p of geo.points) expect(p.y).toBe(middle);
  });

  it('espace les points régulièrement et termine sur le dernier segment', () => {
    const geo = buildSparkGeometry(series(1500, 1510, 1520, 1530))!;
    const gaps = geo.points
      .slice(1)
      .map((p, i) => Math.round(p.x - geo.points[i].x));
    expect(new Set(gaps).size).toBe(1);
    expect(geo.path.startsWith('M')).toBe(true);
    const last = geo.points[geo.points.length - 1];
    expect(geo.lastSegment).toContain(
      `L${last.x.toFixed(1)},${last.y.toFixed(1)}`
    );
  });
});
