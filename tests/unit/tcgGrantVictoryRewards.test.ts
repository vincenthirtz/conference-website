// Récompenses TCG d'une victoire.
// Target: utils/tcg/grantVictoryRewards.ts
//
// L'IDEMPOTENCE EST DÉSORMAIS PROUVÉE ICI — elle ne l'était pas.
//
// L'ancienne version de ce fichier portait un avertissement : le mock Supabase
// partagé ignorait `ignoreDuplicates` et faisait `Object.assign` sur conflit,
// donc un test « rejouer n'ajoute rien » y passait au vert pour la mauvaise
// raison (une seule ligne parce qu'elle avait été RÉÉCRITE, pas parce que
// l'insertion avait été REFUSÉE). Le mock honore maintenant ce drapeau et rend,
// sur un `.select()` chaîné, les seules lignes réellement insérées.
//
// Cette sémantique a été vérifiée sur la vraie base avant d'être simulée :
// `ON CONFLICT DO NOTHING ... RETURNING` avec 3 lignes soumises dont 1 en
// conflit rend 2 lignes. La documentation Supabase, elle, ne la décrit pas.
//
// CE QUE ÇA DÉBLOQUE. Distinguer une PREMIÈRE attribution d'un REJEU sans
// relire avant d'écrire — la relecture préalable étant la fenêtre qui a produit
// quatre publications Discord en double le 2026-09-12. D'où les cas sur
// `tcg.pack_granted` : on annonce une fois, et une seule.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Espion d'émission. Fabrique EN LIGNE et auto-suffisante : `vi.mock` est hissé
// au-dessus des imports, référencer une `const` déclarée plus bas lèverait
// « Cannot access … before initialization » (cf. l'avertissement du setup
// global). On récupère l'espion via `vi.mocked` après l'import.
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { emitBotEvent } from '../../utils/botEvents';
import { grantVictoryRewards } from '../../utils/tcg/grantVictoryRewards';
import { MATCH_WIN_COINS, SCRIM_WIN_COINS } from '../../utils/tcg/economy';

const emitMock = vi.mocked(emitBotEvent);

/** Les événements `tcg.pack_granted` émis, dans l'ordre. */
function granted() {
  return emitMock.mock.calls.filter((c) => c[0] === 'tcg.pack_granted');
}

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
  emitMock.mockClear();
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

  it('rejoué, n’attribue RIEN de plus', async () => {
    // Le cas réel : reprise de cron, correction de score, double appel du hook.
    // Ce test ne vaut que parce que le mock refuse désormais l'insertion en
    // conflit au lieu de réécrire la ligne — sans quoi il passerait au vert
    // sans rien dire du comportement de la base.
    const input = {
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    };

    await grantVictoryRewards(input);
    await grantVictoryRewards(input);

    expect(packs()).toHaveLength(2); // 2 gagnantes, pas 4
    expect(entries()).toHaveLength(2);
    // Et le solde n'a pas doublé : il se recalcule depuis le registre.
    const wallet = wallets().find((w) => w.user_id === ALICE);
    expect(wallet?.balance).toBe(MATCH_WIN_COINS);
  });

  it('annonce chaque paquet une fois, et une seule', async () => {
    const input = {
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    };

    await grantVictoryRewards(input);
    expect(granted()).toHaveLength(2); // une annonce par gagnante

    // LE point du lot : rejouer ne renotifie personne. Sans le `RETURNING` qui
    // ne rend que l'inséré, ce second appel enverrait deux DM de plus.
    emitMock.mockClear();
    await grantVictoryRewards(input);
    expect(granted()).toHaveLength(0);
  });

  it('n’annonce rien aux perdantes', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    });

    const notified = granted().map((c) => (c[1] as { userId: string }).userId);
    expect(notified).toContain(ALICE);
    expect(notified).toContain(BEA);
    expect(notified).not.toContain(CHLOE);
  });

  it('porte le lien Discord quand il existe, `null` sinon', async () => {
    // Une joueuse sans compte lié n'est pas une erreur : l'événement part quand
    // même, et le consommateur décide (pas de DM possible, annonce en salon
    // encore possible). Le taire ferait disparaître sa récompense du canal.
    store.user_discord_links = [
      {
        auth_user_id: ALICE,
        discord_user_id: '123456789012345678',
        discord_username: 'alice',
      },
    ];

    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    });

    const byUser = new Map(
      granted().map((c) => {
        const p = c[1] as { userId: string; discordUserId: string | null };
        return [p.userId, p.discordUserId];
      })
    );
    expect(byUser.get(ALICE)).toBe('123456789012345678');
    expect(byUser.get(BEA)).toBeNull();
  });

  it('annonce le montant gagné et la nature de la rencontre', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: true,
      participants: [{ teamId: WINNER_TEAM, userId: ALICE }],
    });

    const payload = granted()[0]?.[1] as {
      coins: number;
      isScrim: boolean;
      matchId: string;
      ctaUrl: string;
    };
    expect(payload.coins).toBe(SCRIM_WIN_COINS);
    expect(payload.isScrim).toBe(true);
    expect(payload.matchId).toBe(MATCH);
    // Absolue : ce lien part dans un DM, où un chemin relatif est inerte.
    expect(payload.ctaUrl).toMatch(/^https?:\/\/.+\/player\/tcg$/);
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
