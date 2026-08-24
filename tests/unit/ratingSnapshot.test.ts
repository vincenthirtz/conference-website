// tests/unit/ratingSnapshot.test.ts
//
// Couche I/O du rating : `snapshotMatchParticipants` + le backfill de
// `rebuildRatings`.
//
// Ce que ces tests verrouillent, et pourquoi :
//
//   1. L'ENCADREMENT n'est pas noté. Un coach ou une manager figure bien dans
//      `team_members`, mais n'entre pas en jeu : le snapshotter lui donnait un
//      rating Glicko-2 pour des matches qu'il n'a pas joués. Même définition
//      que `eligibleForLineup` (utils/matches/lineup.ts).
//
//   2. Le rebuild répare un snapshot INCOMPLET. Le moteur exige des
//      participants des DEUX camps ; un match dont un seul camp est figé ne
//      produit donc rien — mais il « a des lignes », et l'ancien backfill le
//      considérait comme fait. Le match restait non noté à chaque rebuild,
//      sans erreur. C'est le cas observé en prod sur la 1re édition.
//
//   3. La réparation ne réécrit QUE le camp manquant. Le camp déjà figé est un
//      enregistrement (feuille validée, ou snapshot pris à l'époque) — le
//      remplacer par le roster d'aujourd'hui attribuerait le match à des
//      joueuses arrivées après.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  snapshotMatchParticipants,
  rebuildRatings,
} from '../../utils/rating/applyMatchRating';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = '11111111-1111-4111-8111-111111111111';
const MATCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const A1 = 'd0000000-0000-4000-8000-00000000000a';
const A2 = 'd0000000-0000-4000-8000-00000000000b';
const COACH = 'd0000000-0000-4000-8000-00000000000c';
const B1 = 'd0000000-0000-4000-8000-00000000000d';
const B2 = 'd0000000-0000-4000-8000-00000000000e';

function member(over: Record<string, unknown>): Record<string, unknown> {
  return {
    tenant_id: TENANT,
    team_id: TEAM_A,
    user_id: A1,
    battle_tag: null,
    role: 'player',
    is_substitute: false,
    ...over,
  };
}

function seedMatch(status = 'finished'): void {
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      winner_team_id: TEAM_A,
      completed_at: '2026-01-05T11:06:02.000Z',
      status,
      is_bye: false,
      forfeit_team_id: null,
    },
  ];
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Alpha' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Bravo' },
  ];
  store.team_members = [
    member({ team_id: TEAM_A, user_id: A1 }),
    member({ team_id: TEAM_A, user_id: A2 }),
    member({ team_id: TEAM_A, user_id: COACH, role: 'coach' }),
    member({ team_id: TEAM_B, user_id: B1 }),
    member({ team_id: TEAM_B, user_id: B2 }),
  ];
}

const matchRef = {
  id: MATCH,
  tournament_id: TOURNAMENT,
  team1_id: TEAM_A,
  team2_id: TEAM_B,
};

function participantsOf(teamId: string): string[] {
  return (store.match_participants || [])
    .filter((p) => p.team_id === teamId)
    .map((p) => String(p.user_id))
    .sort();
}

beforeEach(() => resetSupabaseMock());

describe('snapshotMatchParticipants', () => {
  it("exclut l'encadrement (coach / manager) du roster figé", async () => {
    seedMatch();
    await snapshotMatchParticipants(TENANT, matchRef);

    expect(participantsOf(TEAM_A)).toEqual([A1, A2].sort());
    expect(participantsOf(TEAM_A)).not.toContain(COACH);
    expect(participantsOf(TEAM_B)).toEqual([B1, B2].sort());
  });

  it('ne touche que les équipes listées dans onlyTeamIds', async () => {
    seedMatch();
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        tournament_id: TOURNAMENT,
        team_id: TEAM_A,
        user_id: A1,
        battle_tag: null,
        role: 'player',
        is_substitute: false,
      },
    ];

    await snapshotMatchParticipants(TENANT, matchRef, [TEAM_B]);

    // Camp A intact (une seule ligne, pas ré-écrasée par le roster courant).
    expect(participantsOf(TEAM_A)).toEqual([A1]);
    expect(participantsOf(TEAM_B)).toEqual([B1, B2].sort());
  });

  it('respecte une feuille de match validée', async () => {
    seedMatch();
    store.match_lineups = [
      { match_id: MATCH, team_id: TEAM_A, status: 'validated' },
    ];
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        tournament_id: TOURNAMENT,
        team_id: TEAM_A,
        user_id: A1,
        battle_tag: null,
        role: 'player',
        is_substitute: false,
      },
    ];

    await snapshotMatchParticipants(TENANT, matchRef);

    expect(participantsOf(TEAM_A)).toEqual([A1]);
    expect(participantsOf(TEAM_B)).toEqual([B1, B2].sort());
  });
});

describe('rebuildRatings — backfill des snapshots', () => {
  it('répare un snapshot à un seul camp et note enfin le match', async () => {
    seedMatch();
    // Snapshot incomplet : seul le camp A a été figé.
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        tournament_id: TOURNAMENT,
        team_id: TEAM_A,
        user_id: A1,
        battle_tag: null,
        role: 'player',
        is_substitute: false,
      },
    ];

    const result = await rebuildRatings(TENANT);

    // Le camp manquant est comblé, le camp existant reste tel quel.
    expect(participantsOf(TEAM_A)).toEqual([A1]);
    expect(participantsOf(TEAM_B)).toEqual([B1, B2].sort());

    // …et le match produit enfin des ratings.
    expect(result.matches).toBe(1);
    expect(result.players).toBe(3);
    const rated = (store.player_ratings || []).map((r) => String(r.user_id));
    expect(rated.sort()).toEqual([A1, B1, B2].sort());
  });

  it('laisse intact un snapshot complet', async () => {
    seedMatch();
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        tournament_id: TOURNAMENT,
        team_id: TEAM_A,
        user_id: A1,
        battle_tag: null,
        role: 'player',
        is_substitute: false,
      },
      {
        tenant_id: TENANT,
        match_id: MATCH,
        tournament_id: TOURNAMENT,
        team_id: TEAM_B,
        user_id: B1,
        battle_tag: null,
        role: 'player',
        is_substitute: false,
      },
    ];

    await rebuildRatings(TENANT);

    expect(participantsOf(TEAM_A)).toEqual([A1]);
    expect(participantsOf(TEAM_B)).toEqual([B1]);
  });

  it("ne crée rien quand le camp manquant n'a aucun roster", async () => {
    seedMatch();
    store.team_members = (store.team_members || []).filter(
      (m) => m.team_id !== TEAM_B
    );
    store.match_participants = [
      {
        tenant_id: TENANT,
        match_id: MATCH,
        tournament_id: TOURNAMENT,
        team_id: TEAM_A,
        user_id: A1,
        battle_tag: null,
        role: 'player',
        is_substitute: false,
      },
    ];

    const result = await rebuildRatings(TENANT);

    expect(participantsOf(TEAM_B)).toEqual([]);
    expect(result.players).toBe(0);
  });
});
