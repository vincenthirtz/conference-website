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

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
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
/** Le scrim dont MATCH est le miroir, et un second miroir du même scrim. */
const SCRIM = '55555555-5555-4555-8555-555555555555';
const MIRROR_2 = '22222222-2222-4222-8222-222222222222';
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
      scrimId: SCRIM,
      participants: PARTICIPANTS,
    });

    expect(entries().map((e) => e.amount)).toEqual([
      SCRIM_WIN_COINS,
      SCRIM_WIN_COINS,
    ]);
    expect(entries().every((e) => e.source_kind === 'scrim_win')).toBe(true);
    // La clé est le SCRIM, pas le match miroir (cf. le bloc « boucle » plus bas).
    expect(entries().every((e) => e.source_ref === `scrim:${SCRIM}`)).toBe(
      true
    );
    // Le paquet, lui, cite toujours le miroir : `victory` exige un match.
    expect(packs().every((p) => p.source_match_id === MATCH)).toBe(true);
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
      scrimId: SCRIM,
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

/* -------------------------------------------------------------------------- */
/* Boucle de pièces infinies par scrim re-rapporté (audit du 2026-09-15)       */
/* -------------------------------------------------------------------------- */

describe('grantVictoryRewards — un scrim paie UNE fois, quel que soit son miroir', () => {
  // SCÉNARIO D'ATTAQUE. A gagne un scrim classé : miroir M1 → paquet + 50
  // pièces. La capitaine A re-rapporte un score contraire → litige → M1
  // SUPPRIMÉ (le paquet part en cascade via `source_match_id`). Elle re-rapporte
  // le bon score → accord avec le report de B → nouveau miroir M2 → la même
  // fonction est rappelée avec `matchId: M2`.
  //
  // AVANT le correctif : `source_ref = matchId` et paquet clé sur `matchId` →
  // M2 n'entrait en conflit avec rien → 2 écritures de plus, 2 paquets de
  // plus, 2 annonces de plus. À chaque tour. Ce bloc échoue sur l'ancien code
  // (`entries()` vaudrait 4, `packs()` 2 après la cascade simulée).
  const scrimInput = (matchId: string) => ({
    tenantId: TENANT,
    matchId,
    winnerTeamId: WINNER_TEAM,
    isScrim: true,
    scrimId: SCRIM,
    participants: PARTICIPANTS,
  });

  it('un second miroir du même scrim ne recrédite rien, ne redonne aucun paquet', async () => {
    await grantVictoryRewards(scrimInput(MATCH));
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(2);
    expect(granted()).toHaveLength(2);

    // Le litige supprime M1 : `ON DELETE CASCADE` emporte ses paquets. Le mock
    // n'a pas de clé étrangère, on joue la cascade à la main.
    store.tcg_packs = packs().filter((p) => p.source_match_id !== MATCH);
    emitMock.mockClear();

    // L'accord retrouvé recrée un miroir, sous un AUTRE id.
    await grantVictoryRewards(scrimInput(MIRROR_2));

    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(0);
    expect(granted()).toHaveLength(0);
    const wallet = wallets().find((w) => w.user_id === ALICE);
    expect(wallet?.balance).toBe(SCRIM_WIN_COINS);
  });

  it('boucle répétée dix fois : toujours une seule récompense', async () => {
    let mirror = MATCH;
    for (let turn = 0; turn < 10; turn += 1) {
      await grantVictoryRewards(scrimInput(mirror));
      store.tcg_packs = packs().filter((p) => p.source_match_id !== mirror);
      mirror = `00000000-0000-4000-8000-${String(turn).padStart(12, '0')}`;
    }
    const alice = entries().filter((e) => e.user_id === ALICE);
    expect(alice).toHaveLength(1);
    expect(wallets().find((w) => w.user_id === ALICE)?.balance).toBe(
      SCRIM_WIN_COINS
    );
  });

  it('un scrim déjà payé ne redonne pas de paquet même si le miroir est conservé', async () => {
    await grantVictoryRewards(scrimInput(MATCH));
    emitMock.mockClear();
    await grantVictoryRewards(scrimInput(MATCH));
    expect(packs()).toHaveLength(2);
    expect(entries()).toHaveLength(2);
    expect(granted()).toHaveLength(0);
  });

  it('un arbitrage qui change de vainqueur paie les nouvelles gagnantes, pas deux fois les anciennes', async () => {
    await grantVictoryRewards(scrimInput(MATCH));
    await grantVictoryRewards({
      ...scrimInput(MATCH),
      winnerTeamId: LOSER_TEAM,
    });
    const byUser = (id: string) => entries().filter((e) => e.user_id === id);
    expect(byUser(ALICE)).toHaveLength(1);
    expect(byUser(BEA)).toHaveLength(1);
    expect(byUser(CHLOE)).toHaveLength(1);
    expect(packs().filter((p) => p.user_id === CHLOE)).toHaveLength(1);
  });

  it('une victoire de scrim SANS scrimId ne paie rien (jamais de repli sur le miroir)', async () => {
    await grantVictoryRewards({ ...scrimInput(MATCH), scrimId: null });
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
    expect(granted()).toHaveLength(0);
  });

  it('pièces refusées → aucun paquet de scrim (l’ancre est le registre)', async () => {
    // `setTableWriteError` n'atteint pas un upsert chaîné d'un `.select()` dans
    // le mock : on force le refus de CETTE écriture-là, le reste restant réel.
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    const spy = vi.spyOn(supabaseAdmin, 'from').mockImplementation((name) => {
      const builder = real(name) as unknown as Record<string, unknown>;
      if (name === 'tcg_wallet_entries') {
        builder.upsert = () => ({
          select: async () => ({ data: null, error: { message: 'boom' } }),
        });
      }
      return builder as unknown as ReturnType<typeof real>;
    });
    try {
      await grantVictoryRewards(scrimInput(MATCH));
    } finally {
      spy.mockRestore();
    }
    expect(packs()).toHaveLength(0);
    expect(granted()).toHaveLength(0);
  });

  it('les matchs de tournoi gardent leur clé et leur paquet pour toutes les gagnantes', async () => {
    await grantVictoryRewards({
      tenantId: TENANT,
      matchId: MATCH,
      winnerTeamId: WINNER_TEAM,
      isScrim: false,
      participants: PARTICIPANTS,
    });
    expect(entries().every((e) => e.source_ref === MATCH)).toBe(true);
    expect(packs()).toHaveLength(2);
  });
});
