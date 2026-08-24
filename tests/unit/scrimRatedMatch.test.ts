// tests/unit/scrimRatedMatch.test.ts
//
// Rattachement d'un scrim au classement des joueuses et à la saison.
//
// Décision produit (2026-08-24) : un scrim CLASSÉ compte pour le rating
// Glicko-2 et pour les points de saison. Le garde-fou n'est plus le type
// d'épreuve mais le drapeau `ranked`, et ces tests le verrouillent :
//
//   1. `isScrimRatable` — la porte d'entrée. Un scrim non classé, en litige,
//      supprimé, incomplet ou nul ne produit AUCUNE ligne notée.
//   2. `syncScrimRatedMatch` — le miroir `matches` est créé, mis à jour, et
//      surtout RETIRÉ quand le scrim cesse d'être éligible : sinon une équipe
//      garderait au classement les points d'une partie annulée.
//   3. `computeLeagueStandings` — les scrims s'ajoutent aux tournois avec leur
//      propre barème, sans polluer `bestRank` ni `tournamentsCounted` (un
//      scrim n'a pas de classement final).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  isScrimRatable,
  syncScrimRatedMatch,
} from '../../utils/scrims/ratedMatch';
import {
  computeLeagueStandings,
  DEFAULT_SCRIM_POINTS,
  type LeagueScrimResult,
} from '../../utils/leagues/computeStandings';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const SCRIM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A1 = 'd0000000-0000-4000-8000-00000000000a';
const A2 = 'd0000000-0000-4000-8000-00000000000b';
const B1 = 'd0000000-0000-4000-8000-00000000000d';
const B2 = 'd0000000-0000-4000-8000-00000000000e';

function seedScrim(over: Record<string, unknown> = {}): void {
  store.scrims = [
    {
      id: SCRIM,
      tenant_id: TENANT,
      name: 'Scrim test',
      status: 'completed',
      ranked: true,
      deleted_at: null,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_score: 3,
      team2_score: 1,
      winner_team_id: TEAM_A,
      scheduled_date: '2026-05-19T09:11:50.000Z',
      completed_at: '2026-05-19T13:44:43.000Z',
      stream_url: 'https://example.test/vod',
      ...over,
    },
  ];
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Alpha' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Bravo' },
  ];
  store.team_members = [
    { tenant_id: TENANT, team_id: TEAM_A, user_id: A1, role: 'player', is_substitute: false, battle_tag: null },
    { tenant_id: TENANT, team_id: TEAM_A, user_id: A2, role: 'player', is_substitute: false, battle_tag: null },
    { tenant_id: TENANT, team_id: TEAM_B, user_id: B1, role: 'player', is_substitute: false, battle_tag: null },
    { tenant_id: TENANT, team_id: TEAM_B, user_id: B2, role: 'player', is_substitute: false, battle_tag: null },
  ];
  store.matches = [];
  store.match_participants = [];
  store.player_ratings = [];
  store.player_rating_history = [];
}

const mirrors = () =>
  (store.matches || []).filter((m) => m.scrim_id === SCRIM);

beforeEach(() => resetSupabaseMock());

describe('isScrimRatable', () => {
  const base = {
    status: 'completed',
    ranked: true,
    deleted_at: null,
    team1_id: TEAM_A,
    team2_id: TEAM_B,
    winner_team_id: TEAM_A,
  };

  it('accepte un scrim classé, terminé, avec un vainqueur', () => {
    expect(isScrimRatable(base)).toBe(true);
  });

  it('refuse un scrim non classé', () => {
    expect(isScrimRatable({ ...base, ranked: false })).toBe(false);
  });

  it('refuse un scrim en litige, annulé ou en cours', () => {
    for (const status of ['disputed', 'cancelled', 'running', 'scheduled']) {
      expect(isScrimRatable({ ...base, status })).toBe(false);
    }
  });

  it('refuse un scrim supprimé', () => {
    expect(
      isScrimRatable({ ...base, deleted_at: '2026-05-20T00:00:00Z' })
    ).toBe(false);
  });

  it('refuse un match nul — le moteur Glicko ne note pas les nuls', () => {
    expect(isScrimRatable({ ...base, winner_team_id: null })).toBe(false);
  });
});

describe('syncScrimRatedMatch', () => {
  it('miroite un scrim classé en match noté et attribue le rating', async () => {
    seedScrim();
    await syncScrimRatedMatch(TENANT, SCRIM);

    const mirrored = mirrors();
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]).toMatchObject({
      status: 'finished',
      tournament_id: null,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      winner_team_id: TEAM_A,
    });

    // Les quatre joueuses des deux rosters sont notées.
    const rated = (store.player_ratings || []).map((r) => String(r.user_id));
    expect(rated.sort()).toEqual([A1, A2, B1, B2].sort());
  });

  it('est idempotent : rappelée, elle ne duplique ni miroir ni partie', async () => {
    seedScrim();
    await syncScrimRatedMatch(TENANT, SCRIM);
    await syncScrimRatedMatch(TENANT, SCRIM);

    expect(mirrors()).toHaveLength(1);
    const winner = (store.player_ratings || []).find(
      (r) => r.user_id === A1
    ) as Record<string, unknown>;
    expect(winner.games_played).toBe(1);
  });

  it("retire le miroir et l'historique quand le scrim n'est plus éligible", async () => {
    seedScrim();
    await syncScrimRatedMatch(TENANT, SCRIM);
    expect(mirrors()).toHaveLength(1);
    expect((store.player_rating_history || []).length).toBeGreaterThan(0);

    // Le staff dé-classe le scrim.
    (store.scrims[0] as Record<string, unknown>).ranked = false;
    await syncScrimRatedMatch(TENANT, SCRIM);

    expect(mirrors()).toHaveLength(0);
    expect(store.player_rating_history || []).toHaveLength(0);
  });

  it('ne crée rien pour un scrim en litige', async () => {
    seedScrim({ status: 'disputed' });
    await syncScrimRatedMatch(TENANT, SCRIM);
    expect(mirrors()).toHaveLength(0);
    expect(store.player_ratings || []).toHaveLength(0);
  });
});

describe('computeLeagueStandings — scrims rattachés à la saison', () => {
  const pointsTable = { '1': 100, '2': 75 };

  it('ajoute victoire / défaite au barème par défaut (3 / 0)', () => {
    const scrims: LeagueScrimResult[] = [
      {
        scrimId: 's1',
        team1Id: 'A',
        team2Id: 'B',
        winnerTeamId: 'A',
        weight: 1,
      },
    ];
    const rows = computeLeagueStandings({
      tournaments: [],
      rankings: [],
      pointsTable,
      scrims,
    });
    const a = rows.find((r) => r.teamId === 'A');
    const b = rows.find((r) => r.teamId === 'B');
    expect(a?.points).toBe(DEFAULT_SCRIM_POINTS.win);
    expect(b?.points).toBe(DEFAULT_SCRIM_POINTS.loss);
    expect(a?.scrimsCounted).toBe(1);
    // Un scrim n'est pas un tournoi : il ne gonfle ni le compteur ni bestRank.
    expect(a?.tournamentsCounted).toBe(0);
    expect(a?.bestRank).toBeNull();
  });

  it('donne les points de nul aux deux camps', () => {
    const rows = computeLeagueStandings({
      tournaments: [],
      rankings: [],
      pointsTable,
      scrims: [
        {
          scrimId: 's1',
          team1Id: 'A',
          team2Id: 'B',
          winnerTeamId: null,
          weight: 1,
        },
      ],
    });
    expect(rows.every((r) => r.points === DEFAULT_SCRIM_POINTS.draw)).toBe(
      true
    );
  });

  it('cumule tournois et scrims sans que le scrim ne renverse un podium', () => {
    const rows = computeLeagueStandings({
      tournaments: [{ tournamentId: 't1', weight: 1 }],
      rankings: [
        { tournamentId: 't1', teamId: 'A', rank: 1 },
        { tournamentId: 't1', teamId: 'B', rank: 2 },
      ],
      pointsTable,
      scrims: [
        {
          scrimId: 's1',
          team1Id: 'B',
          team2Id: 'A',
          winnerTeamId: 'B',
          weight: 1,
        },
      ],
    });
    const a = rows.find((r) => r.teamId === 'A');
    const b = rows.find((r) => r.teamId === 'B');
    expect(a?.points).toBe(100);
    expect(b?.points).toBe(78); // 75 + 3
    expect(a?.rank).toBe(1); // le scrim ne renverse pas la hiérarchie
    expect(b?.scrimsCounted).toBe(1);
  });

  it('honore un barème de saison surchargé', () => {
    const rows = computeLeagueStandings({
      tournaments: [],
      rankings: [],
      pointsTable,
      scrims: [
        {
          scrimId: 's1',
          team1Id: 'A',
          team2Id: 'B',
          winnerTeamId: 'A',
          weight: 2,
        },
      ],
      scrimPoints: { win: 10, draw: 4, loss: 1 },
    });
    expect(rows.find((r) => r.teamId === 'A')?.points).toBe(20); // 10 × 2
    expect(rows.find((r) => r.teamId === 'B')?.points).toBe(2); // 1 × 2
  });

  it('ignore un scrim sans les deux équipes', () => {
    const rows = computeLeagueStandings({
      tournaments: [],
      rankings: [],
      pointsTable,
      scrims: [
        {
          scrimId: 's1',
          team1Id: 'A',
          team2Id: null,
          winnerTeamId: 'A',
          weight: 1,
        },
      ],
    });
    expect(rows).toHaveLength(0);
  });
});
