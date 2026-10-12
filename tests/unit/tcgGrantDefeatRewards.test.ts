// Récompense TCG d'une défaite en match de tournoi.
// Target: utils/tcg/grantDefeatRewards.ts
//
// Ce que ces tests verrouillent :
//   1. Chaque perdante (remplaçantes comprises) reçoit MATCH_LOSS_COINS, sous
//      `match_loss` et `source_ref` = le match — le schéma de `match_win`.
//   2. Rejouer ne crédite pas deux fois (contrainte UNIQUE, pas un compteur).
//   3. Une joueuse déjà payée en VICTOIRE sur ce match (score corrigé) ne
//      reçoit pas la défaite en plus.
//   4. Ni scrim, ni forfait, ni bye : `defeatRewardLoserTeam` rend `null`.
//   5. Cohérence avec la victoire : les deux s'écrivent côte à côte sans se
//      gêner, chacune sous sa clé.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  defeatRewardLoserTeam,
  grantDefeatRewards,
  MATCH_LOSS_SOURCE_KIND,
} from '../../utils/tcg/grantDefeatRewards';
import { grantVictoryRewards } from '../../utils/tcg/grantVictoryRewards';
import { MATCH_LOSS_COINS, MATCH_WIN_COINS } from '../../utils/tcg/economy';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-1111-1111-111111111111';
const WINNER_TEAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOSER_TEAM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const ALICE = 'user-alice';
const BEA = 'user-bea';
const CHLOE = 'user-chloe';
const DORA = 'user-dora';

/** Deux gagnantes, deux perdantes. */
const PARTICIPANTS = [
  { teamId: WINNER_TEAM, userId: ALICE },
  { teamId: WINNER_TEAM, userId: BEA },
  { teamId: LOSER_TEAM, userId: CHLOE },
  { teamId: LOSER_TEAM, userId: DORA },
];

function entries() {
  return (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
}
function lossEntries() {
  return entries().filter((e) => e.source_kind === MATCH_LOSS_SOURCE_KIND);
}

const FINISHED = {
  scrim_id: null,
  status: 'finished',
  is_bye: false,
  forfeit_team_id: null,
  team1_id: WINNER_TEAM,
  team2_id: LOSER_TEAM,
  winner_team_id: WINNER_TEAM,
};

beforeEach(() => {
  resetSupabaseMock();
});

describe('grantDefeatRewards', () => {
  it('crédite chaque perdante, et rien aux gagnantes', async () => {
    await grantDefeatRewards({
      tenantId: TENANT,
      matchId: MATCH,
      loserTeamId: LOSER_TEAM,
      participants: PARTICIPANTS,
    });

    const rows = lossEntries();
    expect(rows.map((e) => e.user_id).sort()).toEqual([CHLOE, DORA]);
    expect(rows.every((e) => e.amount === MATCH_LOSS_COINS)).toBe(true);
    // Même clé que la victoire : le match.
    expect(rows.every((e) => e.source_ref === MATCH)).toBe(true);
    expect(rows.every((e) => e.tenant_id === TENANT)).toBe(true);
  });

  it('ne crédite pas deux fois quand la validation est rejouée', async () => {
    const input = {
      tenantId: TENANT,
      matchId: MATCH,
      loserTeamId: LOSER_TEAM,
      participants: PARTICIPANTS,
    };
    await grantDefeatRewards(input);
    await grantDefeatRewards(input);
    await grantDefeatRewards(input);

    expect(lossEntries()).toHaveLength(2);
  });

  it('dédoublonne une joueuse inscrite deux fois sur la feuille', async () => {
    await grantDefeatRewards({
      tenantId: TENANT,
      matchId: MATCH,
      loserTeamId: LOSER_TEAM,
      participants: [
        { teamId: LOSER_TEAM, userId: CHLOE },
        { teamId: LOSER_TEAM, userId: CHLOE },
      ],
    });
    expect(lossEntries()).toHaveLength(1);
  });

  it('ne verse pas la défaite à qui a déjà été payée en victoire sur ce match', async () => {
    // Score saisi à l'envers puis corrigé : CHLOE avait reçu la victoire. Elle
    // la garde (aucune reprise) et ne touche pas la défaite en plus.
    store.tcg_wallet_entries = [
      {
        tenant_id: TENANT,
        user_id: CHLOE,
        amount: MATCH_WIN_COINS,
        source_kind: 'match_win',
        source_ref: MATCH,
      },
    ];

    await grantDefeatRewards({
      tenantId: TENANT,
      matchId: MATCH,
      loserTeamId: LOSER_TEAM,
      participants: PARTICIPANTS,
    });

    expect(lossEntries().map((e) => e.user_id)).toEqual([DORA]);
  });

  it('tient le solde à jour depuis le registre', async () => {
    await grantDefeatRewards({
      tenantId: TENANT,
      matchId: MATCH,
      loserTeamId: LOSER_TEAM,
      participants: PARTICIPANTS,
    });
    const wallet = ((store.tcg_wallets ?? []) as Array<Record<string, unknown>>)
      .filter((w) => w.user_id === CHLOE)
      .map((w) => w.balance);
    expect(wallet).toEqual([MATCH_LOSS_COINS]);
  });
});

describe('cohérence avec la victoire', () => {
  it('écrit victoire et défaite côte à côte, chacune sous sa clé', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    });
    await grantDefeatRewards({
      tenantId: TENANT,
      matchId: MATCH,
      loserTeamId: LOSER_TEAM,
      participants: PARTICIPANTS,
    });

    const byUser = new Map(
      entries().map((e) => [e.user_id, `${e.source_kind}:${e.amount}`])
    );
    expect(byUser.get(ALICE)).toBe(`match_win:${MATCH_WIN_COINS}`);
    expect(byUser.get(BEA)).toBe(`match_win:${MATCH_WIN_COINS}`);
    expect(byUser.get(CHLOE)).toBe(`match_loss:${MATCH_LOSS_COINS}`);
    expect(byUser.get(DORA)).toBe(`match_loss:${MATCH_LOSS_COINS}`);
    // Une ligne par joueuse : personne n'est payé deux fois pour le match.
    expect(entries()).toHaveLength(4);
    // Même référence pour les deux : le match.
    expect(entries().every((e) => e.source_ref === MATCH)).toBe(true);
  });
});

describe('defeatRewardLoserTeam', () => {
  it('rend le camp perdant d’un match de tournoi terminé', () => {
    expect(defeatRewardLoserTeam(FINISHED)).toBe(LOSER_TEAM);
    expect(
      defeatRewardLoserTeam({ ...FINISHED, winner_team_id: LOSER_TEAM })
    ).toBe(WINNER_TEAM);
  });

  it('ne paie pas un forfait, même si la victoire, elle, est payée', () => {
    expect(defeatRewardLoserTeam({ ...FINISHED, status: 'walkover' })).toBe(
      null
    );
    expect(
      defeatRewardLoserTeam({ ...FINISHED, forfeit_team_id: LOSER_TEAM })
    ).toBe(null);
  });

  it('ne paie pas un scrim, un bye ni un match non terminé', () => {
    expect(defeatRewardLoserTeam({ ...FINISHED, scrim_id: 'scrim-1' })).toBe(
      null
    );
    expect(defeatRewardLoserTeam({ ...FINISHED, is_bye: true })).toBe(null);
    expect(defeatRewardLoserTeam({ ...FINISHED, status: 'in_progress' })).toBe(
      null
    );
  });

  it('refuse un vainqueur absent ou étranger aux deux camps', () => {
    expect(defeatRewardLoserTeam({ ...FINISHED, winner_team_id: null })).toBe(
      null
    );
    expect(
      defeatRewardLoserTeam({ ...FINISHED, winner_team_id: 'autre-equipe' })
    ).toBe(null);
    expect(defeatRewardLoserTeam({ ...FINISHED, team2_id: null })).toBe(null);
  });
});
