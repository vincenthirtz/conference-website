// Récompenses TCG d'une victoire.
// Target: utils/tcg/grantVictoryRewards.ts
//
// ⚠️ CE QUE CES TESTS NE PROUVENT PAS : l'idempotence.
//
// Le mock Supabase partagé n'honore PAS `ignoreDuplicates`. Sur conflit, son
// `upsert` fait `Object.assign(ligne, item)` — il ÉCRASE au lieu d'ignorer. Un
// test « rejouer n'ajoute rien » y passerait donc au vert pour la mauvaise
// raison : une seule ligne parce qu'elle a été réécrite, pas parce que
// l'insertion a été refusée. Le vert ne dirait rien du comportement réel.
//
// L'idempotence tient aux contraintes de la base — `tcg_packs` UNIQUE
// (tenant_id, user_id, source_match_id) et `tcg_wallet_entries` UNIQUE
// (tenant_id, user_id, source_kind, source_ref) — vérifiées directement dans
// le schéma après application de la migration.
//
// Ce fichier couvre donc ce que le mock rend fidèlement : qui reçoit, combien,
// et comment le solde se dérive du registre.

import { beforeEach, describe, expect, it } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { grantVictoryRewards } from '../../utils/tcg/grantVictoryRewards';
import { MATCH_WIN_COINS, SCRIM_WIN_COINS } from '../../utils/tcg/economy';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-1111-1111-111111111111';
const WINNER_TEAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOSER_TEAM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const ALICE = 'user-alice';
const BEA = 'user-bea';
const CHLOE = 'user-chloe';

/** Deux gagnantes, une perdante. */
const PARTICIPANTS = [
  { teamId: WINNER_TEAM, userId: ALICE },
  { teamId: WINNER_TEAM, userId: BEA },
  { teamId: LOSER_TEAM, userId: CHLOE },
];

function packs() {
  return (store.tcg_packs ?? []) as Array<Record<string, unknown>>;
}
function entries() {
  return (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
}
function wallets() {
  return (store.tcg_wallets ?? []) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('grantVictoryRewards', () => {
  it('donne un paquet à chaque gagnante, et rien aux perdantes', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    });

    const users = packs().map((p) => p.user_id);
    expect(users).toHaveLength(2);
    expect(users).toContain(ALICE);
    expect(users).toContain(BEA);
    expect(users).not.toContain(CHLOE);
  });

  it('crédite le montant d’un match officiel', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    });

    const amounts = entries().map((e) => e.amount);
    expect(amounts).toEqual([MATCH_WIN_COINS, MATCH_WIN_COINS]);
    expect(entries().every((e) => e.source_kind === 'match_win')).toBe(true);
    // `source_ref` = le match : c'est lui qui rend l'écriture unique.
    expect(entries().every((e) => e.source_ref === MATCH)).toBe(true);
  });

  it('crédite moins pour un scrim, et le marque comme tel', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: true,
      participants: PARTICIPANTS,
    });

    expect(entries().map((e) => e.amount)).toEqual([
      SCRIM_WIN_COINS,
      SCRIM_WIN_COINS,
    ]);
    expect(entries().every((e) => e.source_kind === 'scrim_win')).toBe(true);
  });

  it('dédoublonne une joueuse inscrite deux fois sur la feuille', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: [
        { teamId: WINNER_TEAM, userId: ALICE },
        { teamId: WINNER_TEAM, userId: ALICE },
      ],
    });

    expect(packs()).toHaveLength(1);
    expect(entries()).toHaveLength(1);
  });

  it('écrit le solde comme la somme du registre', async () => {
    // Une écriture antérieure : le solde doit la comprendre, pas l'ignorer.
    store.tcg_wallet_entries = [
      {
        tenant_id: TENANT,
        user_id: ALICE,
        amount: 25,
        source_kind: 'admin_grant',
        source_ref: 'seed',
      },
    ];

    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: [{ teamId: WINNER_TEAM, userId: ALICE }],
    });

    const wallet = wallets().find((w) => w.user_id === ALICE);
    expect(wallet?.balance).toBe(25 + MATCH_WIN_COINS);
  });

  it('n’écrit rien quand aucune participante n’est du camp gagnant', async () => {
    // Cas réel : roster figé incomplet, ou équipe adverse sans joueuses en base
    // (sparring externe, toléré pour les scrims).
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: [{ teamId: LOSER_TEAM, userId: CHLOE }],
    });

    expect(packs()).toHaveLength(0);
    expect(entries()).toHaveLength(0);
    expect(wallets()).toHaveLength(0);
  });
});
