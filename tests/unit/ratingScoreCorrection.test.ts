// tests/unit/ratingScoreCorrection.test.ts
//
// Un score CORRIGÉ après notation doit refaire le rating ET payer le vrai
// vainqueur.
//
// Constaté le 2026-10-08 : trois victoires des Chocomates avaient d'abord été
// saisies à l'envers (ou en forfait au mauvais camp). Le calcul incrémental
// s'arrêtait dès qu'un historique existait pour le match : la correction
// laissait des DÉFAITES aux profils de l'équipe gagnante, et ses pièces et
// paquets chez l'adversaire.
//
// Ce que ces tests verrouillent :
//   1. Vainqueur corrigé → l'historique est rejoué (victoires au bon camp) et
//      la récompense part au vainqueur actuel.
//   2. Un rejeu sans changement ne refait rien (pas de rebuild à chaque score).
//   3. Le rebuild ne paie PAS un match qui n'a jamais rien payé (pas de
//      distribution rétroactive au détour d'un recalcul).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const grantVictoryRewards = vi.fn(async () => undefined);
vi.mock('../../utils/tcg/grantVictoryRewards', () => ({
  grantVictoryRewards: (...args: unknown[]) =>
    (grantVictoryRewards as (...a: unknown[]) => Promise<void>)(...args),
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  applyMatchRatingIncremental,
  rebuildRatings,
} from '../../utils/rating/applyMatchRating';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = '11111111-1111-4111-8111-111111111111';
const MATCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A1 = 'd0000000-0000-4000-8000-00000000000a';
const A2 = 'd0000000-0000-4000-8000-00000000000b';
const B1 = 'd0000000-0000-4000-8000-00000000000d';
const B2 = 'd0000000-0000-4000-8000-00000000000e';

function seed(winner: string): void {
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: TOURNAMENT,
      scrim_id: null,
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      winner_team_id: winner,
      completed_at: '2026-10-02T18:42:48.000Z',
      status: 'finished',
      is_bye: false,
      forfeit_team_id: null,
    },
  ];
  store.teams = [
    { id: TEAM_A, tenant_id: TENANT, name: 'Chocomates' },
    { id: TEAM_B, tenant_id: TENANT, name: 'Bravo' },
  ];
  store.team_members = [A1, A2, B1, B2].map((user_id) => ({
    tenant_id: TENANT,
    team_id: user_id === A1 || user_id === A2 ? TEAM_A : TEAM_B,
    user_id,
    battle_tag: null,
    role: 'player',
    is_substitute: false,
  }));
}

/** Ce que `grantVictoryRewards` aurait écrit pour ce camp. */
function paidTo(users: string[]): void {
  store.tcg_wallet_entries = users.map((user_id) => ({
    tenant_id: TENANT,
    user_id,
    amount: 20,
    source_kind: 'match_win',
    source_ref: MATCH,
  }));
}

function resultOf(userId: string): unknown {
  return (store.player_rating_history || []).find(
    (h) => h.user_id === userId && h.match_id === MATCH
  )?.result;
}

beforeEach(() => {
  resetSupabaseMock();
  grantVictoryRewards.mockClear();
});

describe('score corrigé après notation', () => {
  it('rejoue le rating et paie le vainqueur actuel', async () => {
    seed(TEAM_B); // saisi à l'envers
    await applyMatchRatingIncremental(TENANT, MATCH);
    expect(resultOf(A1)).toBe('loss');
    paidTo([B1, B2]);
    grantVictoryRewards.mockClear();

    (store.matches as Array<Record<string, unknown>>)[0].winner_team_id =
      TEAM_A; // corrigé
    await applyMatchRatingIncremental(TENANT, MATCH);

    expect(resultOf(A1)).toBe('win');
    expect(resultOf(B1)).toBe('loss');
    expect(grantVictoryRewards).toHaveBeenCalledTimes(1);
    expect(grantVictoryRewards).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: MATCH, winnerTeamId: TEAM_A })
    );
  });

  it('ne refait rien quand le vainqueur est inchangé', async () => {
    seed(TEAM_A);
    await applyMatchRatingIncremental(TENANT, MATCH);
    paidTo([A1, A2]);
    grantVictoryRewards.mockClear();
    const before = JSON.stringify(store.player_rating_history);

    await applyMatchRatingIncremental(TENANT, MATCH);

    expect(grantVictoryRewards).not.toHaveBeenCalled();
    expect(JSON.stringify(store.player_rating_history)).toBe(before);
  });

  it("le rebuild ne paie pas un match qui n'a jamais rien payé", async () => {
    seed(TEAM_A);
    store.tcg_wallet_entries = [];
    await rebuildRatings(TENANT);
    expect(grantVictoryRewards).not.toHaveBeenCalled();
  });
});
