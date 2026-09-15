// Série de check-ins — récompense TCG.
// Target: utils/tcg/grantCheckinStreak.ts (+ son branchement dans
// `redeemCheckinToken`, utils/checkin.ts).
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LA DÉFINITION D'UNE SÉRIE. Consécutive, dans le tournoi, bornée au match
//      validé ; un forfait la rompt, un bye ou un match annulé ne la rompt pas.
//      C'est ce que le réducteur pur fixe, sans base.
//
//   2. JAMAIS DEUX FOIS. Un rejeu — double clic, lien public ET bouton
//      Discord — ne crédite ni ne donne un second paquet. La garantie est dans
//      la contrainte UNIQUE du porte-monnaie (le mock honore
//      `ignoreDuplicates`), pas dans une relecture.
//
//   3. LA CLÉ EST LE MATCH QUI CLÔT LA FENÊTRE. Une série reprise après une
//      rupture a sa propre clé ; avec un numéro de série, elle aurait été jetée
//      comme un doublon.
//
//   4. UNE ERREUR N'EST PAS UN « RIEN À DONNER ». Un calendrier ou un roster
//      illisible rend `error` et n'écrit rien.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
// `utils/checkin.ts` charge des expéditeurs qu'on ne veut pas exécuter.
vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail: vi.fn(),
  sendCheckinReminderEmail: vi.fn(),
  sendCheckinForfeitEmail: vi.fn(),
}));
vi.mock('../../utils/discord', () => ({
  notifyCheckinReminder: vi.fn(),
  notifyCheckinForfeit: vi.fn(),
  notifyLineupReminder: vi.fn(),
}));
vi.mock('../../utils/matches/applyScore', () => ({
  applyMatchScore: vi.fn(),
}));

import {
  store,
  resetSupabaseMock,
  setTableWriteError,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  checkinStreakEndingAt,
  closesStreakWindow,
  grantCheckinStreakReward,
  type StreakMatch,
} from '../../utils/tcg/grantCheckinStreak';
import {
  CHECKIN_STREAK_COINS,
  CHECKIN_STREAK_LENGTH,
  earnReward,
} from '../../utils/tcg/earnSources';
import { redeemCheckinToken } from '../../utils/checkin';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = '5b0c7a2e-3d4f-4a1b-9c8d-7e6f5a4b3c2d';
const TEAM = '0d9e8f7a-6b5c-4d3e-8f2a-1b0c9d8e7f6a';
const OPPONENT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const STARTER_A = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const STARTER_B = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const SUBSTITUTE = '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b';
const COACH = '4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c';

/** Identifiants de match v4 valides, ordonnés : m(1) < m(2) < … */
const m = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Un jour distinct par match : n ∈ [1, 28]. */
const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

const entries = () =>
  (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
const packs = () => (store.tcg_packs ?? []) as Array<Record<string, unknown>>;

/** Match n, le jour n, check-in de l'équipe fait ou non. */
function seedMatch(
  n: number,
  over: {
    checkedIn?: boolean;
    status?: string;
    is_bye?: boolean;
    side?: 1 | 2;
    tournament_id?: string | null;
    token?: string | null;
  } = {}
) {
  const side = over.side ?? 1;
  const checkedAt = over.checkedIn ? `${day(n)}T18:00:00.000Z` : null;
  (store.matches ||= []).push({
    id: m(n),
    tenant_id: TENANT,
    tournament_id:
      over.tournament_id === undefined ? TOURNAMENT : over.tournament_id,
    scheduled_at: `${day(n)}T19:00:00.000Z`,
    is_bye: over.is_bye ?? false,
    status: over.status ?? 'finished',
    deleted_at: null,
    team1_id: side === 1 ? TEAM : OPPONENT,
    team2_id: side === 1 ? OPPONENT : TEAM,
    team1_checked_in_at: side === 1 ? checkedAt : null,
    team2_checked_in_at: side === 2 ? checkedAt : null,
    team1_checkin_token: side === 1 ? (over.token ?? null) : null,
    team2_checkin_token: side === 2 ? (over.token ?? null) : null,
    team1: {
      id: side === 1 ? TEAM : OPPONENT,
      name: side === 1 ? 'Alpha' : 'Bravo',
    },
    team2: {
      id: side === 1 ? OPPONENT : TEAM,
      name: side === 1 ? 'Bravo' : 'Alpha',
    },
  } as never);
}

/**
 * Fait REFUSER l'écriture des pièces, comme un CHECK (23514).
 *
 * Pas `setTableWriteError` : le mock repasse un upsert en lecture avant de
 * consulter ce levier, qui ne s'applique donc qu'aux `insert`. Un espion
 * ciblé sur la seule table visée garde tout le reste du mock réel.
 */
function refuseWalletWrites() {
  const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
  return vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(((
    table: string
  ) => {
    if (table !== 'tcg_wallet_entries') return realFrom(table);
    return {
      upsert: () => ({
        select: async () => ({
          data: null,
          error: { code: '23514', message: 'source_kind check' },
        }),
      }),
    };
  }) as any);
}

function seedRoster() {
  store.team_members = [
    {
      tenant_id: TENANT,
      team_id: TEAM,
      user_id: STARTER_A,
      role: 'dps',
      is_substitute: false,
    },
    {
      tenant_id: TENANT,
      team_id: TEAM,
      user_id: STARTER_B,
      role: 'tank',
      is_substitute: false,
    },
    {
      tenant_id: TENANT,
      team_id: TEAM,
      user_id: SUBSTITUTE,
      role: 'support',
      is_substitute: true,
    },
    {
      tenant_id: TENANT,
      team_id: TEAM,
      user_id: COACH,
      role: 'coach',
      is_substitute: false,
    },
    // Membre sans compte : ne peut rien recevoir.
    {
      tenant_id: TENANT,
      team_id: TEAM,
      user_id: null,
      role: 'dps',
      is_substitute: false,
    },
    // Une autre équipe : hors sujet.
    {
      tenant_id: TENANT,
      team_id: OPPONENT,
      user_id: '5a6b7c8d-9e0f-4a1b-8c3d-4e5f6a7b8c9d',
      role: 'dps',
      is_substitute: false,
    },
  ] as never;
}

beforeEach(() => {
  resetSupabaseMock();
  setTableWriteError('tcg_packs', null);
  store.matches = [] as never;
  seedRoster();
});

/* -----------------------------------------------------------
 * Le réducteur pur
 * ---------------------------------------------------------*/

/** Charges `tcg.reward_granted` persistées dans l'outbox du bot. */
const rewardEvents = () =>
  ((store.bot_event_outbox ?? []) as Array<Record<string, any>>)
    .filter(
      (row) =>
        row.event_name === 'tcg.reward_granted' ||
        row.payload?.event === 'tcg.reward_granted'
    )
    .map((row) => row.payload?.data as Record<string, unknown>);

describe('checkinStreakEndingAt', () => {
  const base = (n: number, over: Partial<StreakMatch> = {}): StreakMatch => ({
    id: m(n),
    scheduledAt: `${day(n)}T19:00:00.000Z`,
    isBye: false,
    status: 'finished',
    deleted: false,
    checkedIn: true,
    ...over,
  });

  it('compte les check-ins consécutifs jusqu’au match courant inclus', () => {
    const matches = [1, 2, 3, 4, 5].map((n) => base(n));
    expect(checkinStreakEndingAt(matches, m(5))).toBe(5);
    expect(checkinStreakEndingAt(matches, m(3))).toBe(3);
  });

  it('tient le match courant pour validé, même si la lecture ne le voit pas encore', () => {
    const matches = [
      ...[1, 2, 3, 4].map((n) => base(n)),
      base(5, { checkedIn: false }),
    ];
    expect(checkinStreakEndingAt(matches, m(5))).toBe(5);
  });

  it('un match SANS check-in (forfait) rompt la série', () => {
    const matches = [
      base(1),
      base(2, { checkedIn: false, status: 'walkover' }),
      base(3),
      base(4),
    ];
    expect(checkinStreakEndingAt(matches, m(4))).toBe(2);
  });

  it('un bye, un match annulé, reporté ou supprimé ne compte ni ne rompt', () => {
    const matches = [
      base(1),
      base(2, { isBye: true, checkedIn: false }),
      base(3, { status: 'cancelled', checkedIn: false }),
      base(4, { status: 'postponed', checkedIn: false }),
      base(5, { deleted: true, checkedIn: false }),
      base(6),
    ];
    expect(checkinStreakEndingAt(matches, m(6))).toBe(2);
  });

  it('ignore les matchs PLUS TARDIFS que le match courant', () => {
    const matches = [base(1), base(2), base(3, { checkedIn: false })];
    expect(checkinStreakEndingAt(matches, m(2))).toBe(2);
  });

  it('rend 0 pour un match courant introuvable ou neutre', () => {
    expect(checkinStreakEndingAt([base(1)], m(9))).toBe(0);
    expect(checkinStreakEndingAt([base(1, { isBye: true })], m(1))).toBe(0);
  });

  it('ferme une fenêtre à chaque multiple de la longueur de série', () => {
    expect(CHECKIN_STREAK_LENGTH).toBe(5);
    expect(closesStreakWindow(5)).toBe(true);
    expect(closesStreakWindow(10)).toBe(true);
    expect(closesStreakWindow(4)).toBe(false);
    expect(closesStreakWindow(6)).toBe(false);
    expect(closesStreakWindow(0)).toBe(false);
  });
});

/* -----------------------------------------------------------
 * L'écrivain
 * ---------------------------------------------------------*/

describe('grantCheckinStreakReward', () => {
  function seedFiveCheckins() {
    for (const n of [1, 2, 3, 4]) seedMatch(n, { checkedIn: true });
    seedMatch(5, { checkedIn: true, status: 'pending' });
  }

  it('au 5ᵉ check-in consécutif, crédite les TITULAIRES : pièces + un paquet `streak`', async () => {
    seedFiveCheckins();

    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });

    expect(outcome).toEqual({
      status: 'granted',
      streak: 5,
      credited: 2,
      packsExpected: 2,
      packsGranted: 2,
    });

    const recipients = entries()
      .map((e) => e.user_id)
      .sort();
    // Ni la remplaçante, ni le coach, ni le membre sans compte.
    expect(recipients).toEqual([STARTER_A, STARTER_B].sort());
    for (const entry of entries()) {
      expect(entry).toMatchObject({
        tenant_id: TENANT,
        source_kind: 'checkin_streak',
        amount: CHECKIN_STREAK_COINS,
        // La clé = le match qui CLÔT la fenêtre.
        source_ref: `${TOURNAMENT}:${m(5)}`,
      });
    }
    expect(packs()).toHaveLength(earnReward('checkin_streak').packs * 2);
    for (const pack of packs()) {
      expect(pack).toMatchObject({
        source_kind: 'streak',
        source_match_id: null,
      });
    }
  });

  it('un REJEU ne crédite rien et ne donne aucun second paquet', async () => {
    seedFiveCheckins();
    const input = { tenantId: TENANT, matchId: m(5), teamId: TEAM };

    await grantCheckinStreakReward(input);
    const replay = await grantCheckinStreakReward(input);

    expect(replay).toMatchObject({
      status: 'granted',
      credited: 0,
      packsGranted: 0,
    });
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(2);
  });

  it('annonce `tcg.reward_granted` aux titulaires créditées, jamais sur un rejeu', async () => {
    seedFiveCheckins();
    const input = { tenantId: TENANT, matchId: m(5), teamId: TEAM };

    await grantCheckinStreakReward(input);
    const events = rewardEvents();
    expect(events.map((e) => e.userId).sort()).toEqual(
      [STARTER_A, STARTER_B].sort()
    );
    for (const event of events) {
      expect(event).toMatchObject({
        reason: 'checkin_streak',
        streak: 5,
        rank: null,
        coins: CHECKIN_STREAK_COINS,
        packs: earnReward('checkin_streak').packs,
        tournamentId: TOURNAMENT,
        sourceRef: `${TOURNAMENT}:${m(5)}`,
      });
    }

    await grantCheckinStreakReward(input);
    expect(rewardEvents()).toHaveLength(2);
  });

  it('ne récompense rien avant la fin de la fenêtre', async () => {
    for (const n of [1, 2, 3]) seedMatch(n, { checkedIn: true });
    seedMatch(4, { checkedIn: true, status: 'pending' });

    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(4),
      teamId: TEAM,
    });

    expect(outcome).toEqual({ status: 'no_window', streak: 4 });
    expect(entries()).toHaveLength(0);
  });

  it('compte l’équipe des deux côtés du match (team1 OU team2)', async () => {
    seedMatch(1, { checkedIn: true, side: 2 });
    seedMatch(2, { checkedIn: true, side: 1 });
    seedMatch(3, { checkedIn: true, side: 2 });
    seedMatch(4, { checkedIn: true, side: 1 });
    seedMatch(5, { checkedIn: true, side: 2, status: 'pending' });

    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });
    expect(outcome).toMatchObject({ status: 'granted', streak: 5 });
  });

  it('une série REPRISE après une rupture repart de zéro et a sa propre clé', async () => {
    // Série 1 (matchs 1-5), forfait au 6, série 2 (7-11). Avec un numéro de
    // série pour clé, la seconde aurait repris « 1 » et la contrainte UNIQUE
    // l'aurait jetée comme un doublon : c'est ce que ce cas interdit.
    for (const n of [1, 2, 3, 4, 5]) seedMatch(n, { checkedIn: true });
    seedMatch(6, { checkedIn: false, status: 'walkover' });
    for (const n of [7, 8, 9, 10, 11]) seedMatch(n, { checkedIn: true });

    const first = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });
    const midway = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(9),
      teamId: TEAM,
    });
    const second = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(11),
      teamId: TEAM,
    });

    expect(first).toMatchObject({ status: 'granted', credited: 2 });
    // Le forfait a remis le compteur à zéro : 3, pas 8.
    expect(midway).toEqual({ status: 'no_window', streak: 3 });
    expect(second).toMatchObject({ status: 'granted', streak: 5, credited: 2 });
    expect(new Set(entries().map((e) => e.source_ref))).toEqual(
      new Set([`${TOURNAMENT}:${m(5)}`, `${TOURNAMENT}:${m(11)}`])
    );
    expect(packs()).toHaveLength(4);
  });

  it('dix check-ins d’affilée ferment une seconde fenêtre, sans rejouer la première', async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      seedMatch(n, { checkedIn: true });

    await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });
    const tenth = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(10),
      teamId: TEAM,
    });

    expect(tenth).toMatchObject({ status: 'granted', streak: 10, credited: 2 });
    expect(entries()).toHaveLength(4);
  });

  it('paquets refusés : pièces écrites, écart RENDU (packsGranted < packsExpected)', async () => {
    seedFiveCheckins();
    setTableWriteError('tcg_packs', { message: 'tcg_packs_source_coherent' });

    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });

    expect(outcome).toEqual({
      status: 'granted',
      streak: 5,
      credited: 2,
      packsExpected: 2,
      packsGranted: 0,
    });
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(0);
  });

  it('un match hors tournoi (scrim) n’a pas de série', async () => {
    seedMatch(1, { checkedIn: true, tournament_id: null });
    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(1),
      teamId: TEAM,
    });
    expect(outcome).toEqual({ status: 'no_tournament' });
    expect(entries()).toHaveLength(0);
  });

  it('un roster illisible rend `error` et n’écrit RIEN', async () => {
    seedFiveCheckins();
    const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
    const spy = vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(((
      table: string
    ) => {
      if (table !== 'team_members') return realFrom(table);
      const failing: any = {
        select: () => failing,
        eq: () => failing,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, error: { message: 'timeout' } }),
      };
      return failing;
    }) as any);

    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });
    spy.mockRestore();

    // Surtout PAS `no_recipient` : une panne n'est pas un roster vide.
    expect(outcome).toEqual({ status: 'error' });
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('pièces refusées par la base (migration non passée) : `error`, aucun paquet', async () => {
    seedFiveCheckins();
    const spy = refuseWalletWrites();

    const outcome = await grantCheckinStreakReward({
      tenantId: TENANT,
      matchId: m(5),
      teamId: TEAM,
    });
    spy.mockRestore();

    expect(outcome).toEqual({ status: 'error' });
    // Le paquet ne précède JAMAIS les pièces.
    expect(packs()).toHaveLength(0);
  });
});

/* -----------------------------------------------------------
 * Branchement : le check-in lui-même
 * ---------------------------------------------------------*/

describe('redeemCheckinToken → série de check-ins', () => {
  it('le 5ᵉ check-in via le lien crédite ; le même lien rejoué ne recrédite pas', async () => {
    const token = 'T'.repeat(32);
    for (const n of [1, 2, 3, 4]) seedMatch(n, { checkedIn: true });
    seedMatch(5, { checkedIn: false, status: 'pending', token });

    const first = await redeemCheckinToken(TENANT, token);
    expect(first).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(2);

    const replay = await redeemCheckinToken(TENANT, token);
    expect(replay).toMatchObject({ ok: true, alreadyCheckedIn: true });
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(2);
  });

  it('une récompense en échec ne fait PAS échouer le check-in', async () => {
    const token = 'U'.repeat(32);
    for (const n of [1, 2, 3, 4]) seedMatch(n, { checkedIn: true });
    seedMatch(5, { checkedIn: false, status: 'pending', token });
    const spy = refuseWalletWrites();

    const result = await redeemCheckinToken(TENANT, token);
    spy.mockRestore();
    expect(entries()).toHaveLength(0);

    expect(result).toMatchObject({ ok: true, alreadyCheckedIn: false });
    const match = (store.matches as Array<Record<string, unknown>>).find(
      (row) => row.id === m(5)
    );
    expect(match?.team1_checked_in_at).toBeTruthy();
  });
});
