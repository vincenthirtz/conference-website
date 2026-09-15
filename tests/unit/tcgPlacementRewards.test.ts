// Palmarès de fin de tournoi — récompense TCG.
// Target: utils/tcg/grantPlacementRewards.ts (+ son branchement dans
// `POST /api/admin/tournament/[id]/finalize`).
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE BARÈME EST CELUI DU REGISTRE, RANG PAR RANG. Aucun montant n'est
//      écrit ici : on compare à `earnReward('tournament_placement', { rank })`.
//
//   2. QUI TOUCHE — le choix conservateur documenté dans docs/TCG.md : les
//      TITULAIRES qui ont joué pour l'équipe dans ce tournoi, pas le roster
//      courant, pas les remplaçantes. C'est la définition du badge.
//
//   3. JAMAIS DEUX FOIS. Une finalisation relancée, ou réécrite avec
//      `force: true`, ne recrédite personne et ne donne aucun second paquet.
//
//   4. UNE ERREUR N'EST PAS UNE LISTE VIDE. Des participations illisibles
//      rendent `error` et n'écrivent RIEN : payer sur une lecture partielle
//      oublierait des joueuses, que la clé « une fois par tournoi » rendrait
//      irrattrapables.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setTableWriteError,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { grantPlacementRewards } from '../../utils/tcg/grantPlacementRewards';
import { earnReward } from '../../utils/tcg/earnSources';
import finalizeHandler from '../../pages/api/admin/tournament/[id]/finalize';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = '6c1d8b3f-4e5a-4b2c-8d9e-0f1a2b3c4d5e';
const OTHER_TOURNAMENT = '7d2e9c4a-5f6b-4c3d-9e0f-1a2b3c4d5e6f';

const TEAM = (n: number) =>
  `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = (n: number) =>
  `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;

const entries = () =>
  (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
const packs = () => (store.tcg_packs ?? []) as Array<Record<string, unknown>>;
const entryOf = (userId: string) => entries().find((e) => e.user_id === userId);
const packsOf = (userId: string) => packs().filter((p) => p.user_id === userId);
/** Charges `tcg.reward_granted` persistées dans l'outbox du bot. */
const rewardEvents = () =>
  ((store.bot_event_outbox ?? []) as Array<Record<string, any>>)
    .filter(
      (row) =>
        row.event_name === 'tcg.reward_granted' ||
        row.payload?.event === 'tcg.reward_granted'
    )
    .map((row) => row.payload?.data as Record<string, unknown>);

let participantSeq = 0;
function played(
  team: string,
  user: string | null,
  over: { is_substitute?: boolean; tournament_id?: string } = {}
) {
  participantSeq += 1;
  (store.match_participants ||= []).push({
    id: `cccccccc-0000-4000-8000-${String(participantSeq).padStart(12, '0')}`,
    tenant_id: TENANT,
    tournament_id: over.tournament_id ?? TOURNAMENT,
    match_id: 'dddddddd-0000-4000-8000-000000000001',
    team_id: team,
    user_id: user,
    is_substitute: over.is_substitute ?? false,
  } as never);
}

beforeEach(() => {
  resetSupabaseMock();
  setTableWriteError('tcg_packs', null);
  participantSeq = 0;
  store.match_participants = [] as never;
});

/* -----------------------------------------------------------
 * L'écrivain
 * ---------------------------------------------------------*/

describe('grantPlacementRewards', () => {
  it('paie chaque rang selon le registre : pièces ET nombre de paquets', async () => {
    for (const n of [1, 2, 3, 4, 5]) played(TEAM(n), USER(n));
    // Rangs 1, 2, 3, 8, 9 — le 9ᵉ est hors barème.
    const rankings = [
      { teamId: TEAM(1), rank: 1 },
      { teamId: TEAM(2), rank: 2 },
      { teamId: TEAM(3), rank: 3 },
      { teamId: TEAM(4), rank: 8 },
      { teamId: TEAM(5), rank: 9 },
    ];

    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings,
    });

    const expectedPacks = [1, 2, 3, 8]
      .map((rank) => earnReward('tournament_placement', { rank }).packs)
      .reduce((a, b) => a + b, 0);
    expect(report).toEqual({
      status: 'granted',
      eligible: 4,
      granted: 4,
      packsExpected: expectedPacks,
      packsGranted: expectedPacks,
    });

    for (const [user, rank] of [
      [USER(1), 1],
      [USER(2), 2],
      [USER(3), 3],
      [USER(4), 8],
    ] as const) {
      const reward = earnReward('tournament_placement', { rank });
      expect(entryOf(user)).toMatchObject({
        tenant_id: TENANT,
        source_kind: 'tournament_placement',
        source_ref: TOURNAMENT,
        amount: reward.coins,
      });
      expect(packsOf(user)).toHaveLength(reward.packs);
      for (const pack of packsOf(user)) {
        expect(pack).toMatchObject({
          source_kind: 'placement',
          source_match_id: null,
        });
      }
    }
    // Le 9ᵉ n'est pas dans le barème : rien.
    expect(entryOf(USER(5))).toBeUndefined();
  });

  it('ne paie que les TITULAIRES de CE tournoi, avec un compte', async () => {
    played(TEAM(1), USER(1));
    played(TEAM(1), USER(2), { is_substitute: true });
    played(TEAM(1), null);
    played(TEAM(1), USER(3), { tournament_id: OTHER_TOURNAMENT });
    // Un titulaire qui apparaît sur plusieurs matchs n'est payé qu'une fois.
    played(TEAM(1), USER(1));

    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [{ teamId: TEAM(1), rank: 1 }],
    });

    expect(report).toMatchObject({
      status: 'granted',
      eligible: 1,
      granted: 1,
    });
    expect(entries().map((e) => e.user_id)).toEqual([USER(1)]);
    expect(packsOf(USER(1))).toHaveLength(
      earnReward('tournament_placement', { rank: 1 }).packs
    );
  });

  it('une joueuse passée par deux équipes classées ne touche que son MEILLEUR rang', async () => {
    played(TEAM(1), USER(1));
    played(TEAM(3), USER(1));

    await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [
        { teamId: TEAM(3), rank: 3 },
        { teamId: TEAM(1), rank: 1 },
      ],
    });

    expect(entries()).toHaveLength(1);
    expect(entryOf(USER(1))?.amount).toBe(
      earnReward('tournament_placement', { rank: 1 }).coins
    );
  });

  it('un REJEU ne crédite rien et ne donne aucun second paquet', async () => {
    played(TEAM(1), USER(1));
    played(TEAM(2), USER(2));
    const input = {
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [
        { teamId: TEAM(1), rank: 1 },
        { teamId: TEAM(2), rank: 2 },
      ],
    };

    const first = await grantPlacementRewards(input);
    const entriesAfterFirst = entries().length;
    const packsAfterFirst = packs().length;
    const replay = await grantPlacementRewards(input);

    expect(first.granted).toBe(2);
    expect(replay).toMatchObject({
      status: 'granted',
      eligible: 2,
      granted: 0,
      packsGranted: 0,
    });
    expect(entries()).toHaveLength(entriesAfterFirst);
    expect(packs()).toHaveLength(packsAfterFirst);
  });

  it('annonce `tcg.reward_granted` une fois par joueuse créditée, jamais sur un rejeu', async () => {
    // Le DM Discord d'un palmarès : son rang, ce qu'elle gagne, et le tournoi.
    // Émis sur les seules lignes écrites — relancer la finalisation (la voie de
    // reprise) ne doit renotifier personne.
    store.tournaments = [
      { id: TOURNAMENT, tenant_id: TENANT, name: 'Women’s Cup 2026' },
    ] as never;
    played(TEAM(1), USER(1));
    played(TEAM(2), USER(2));
    const input = {
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [
        { teamId: TEAM(1), rank: 1 },
        { teamId: TEAM(2), rank: 2 },
      ],
    };

    await grantPlacementRewards(input);
    const events = rewardEvents().sort((a, b) =>
      String(a.userId).localeCompare(String(b.userId))
    );
    expect(events).toHaveLength(2);
    for (const [user, rank] of [
      [USER(1), 1],
      [USER(2), 2],
    ] as const) {
      const reward = earnReward('tournament_placement', { rank });
      expect(events.find((e) => e.userId === user)).toMatchObject({
        reason: 'tournament_placement',
        rank,
        streak: null,
        coins: reward.coins,
        packs: reward.packs,
        tournamentId: TOURNAMENT,
        tournamentName: 'Women’s Cup 2026',
        sourceRef: TOURNAMENT,
      });
    }

    await grantPlacementRewards(input);
    expect(rewardEvents()).toHaveLength(2);
  });

  it('un classement RÉÉCRIT ne repaie pas la différence, mais crédite une nouvelle entrée du top 8', async () => {
    played(TEAM(1), USER(1));
    played(TEAM(2), USER(2));
    played(TEAM(9), USER(9));

    await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [
        { teamId: TEAM(1), rank: 1 },
        { teamId: TEAM(2), rank: 2 },
        { teamId: TEAM(9), rank: 9 },
      ],
    });
    // Réécriture : l'équipe 2 passe 1ʳᵉ, l'équipe 9 entre dans le top 8.
    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [
        { teamId: TEAM(2), rank: 1 },
        { teamId: TEAM(1), rank: 2 },
        { teamId: TEAM(9), rank: 8 },
      ],
    });

    expect(report.granted).toBe(1);
    // L'équipe 2 garde le montant de sa PREMIÈRE attribution (rang 2).
    expect(entryOf(USER(2))?.amount).toBe(
      earnReward('tournament_placement', { rank: 2 }).coins
    );
    expect(entryOf(USER(9))?.amount).toBe(
      earnReward('tournament_placement', { rank: 8 }).coins
    );
    expect(entries().filter((e) => e.user_id === USER(1))).toHaveLength(1);
  });

  it('des participations illisibles rendent `error` et n’écrivent RIEN', async () => {
    played(TEAM(1), USER(1));
    const realFrom = supabaseAdmin.from.bind(supabaseAdmin);
    const spy = vi.spyOn(supabaseAdmin as any, 'from').mockImplementation(((
      table: string
    ) => {
      if (table !== 'match_participants') return realFrom(table);
      const failing: any = {};
      for (const method of ['select', 'eq', 'in', 'order', 'range']) {
        failing[method] = () => failing;
      }
      failing.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: { message: 'statement timeout' } });
      return failing;
    }) as any);

    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [{ teamId: TEAM(1), rank: 1 }],
    });
    spy.mockRestore();

    // Surtout PAS `nothing` : une panne n'est pas « personne à payer ».
    expect(report.status).toBe('error');
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('lit au-delà d’une page PostgREST (1 000 lignes)', async () => {
    // 1 200 lignes de participation : une lecture sans pagination n'en verrait
    // que 1 000, et oublierait des joueuses sans le moindre message.
    for (let i = 1; i <= 1200; i++) played(TEAM(1), USER(i));

    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [
        { teamId: TEAM(8), rank: 8 },
        { teamId: TEAM(1), rank: 4 },
      ],
    });

    expect(report).toMatchObject({ eligible: 1200, granted: 1200 });
  });

  it('paquets refusés : pièces écrites, écart RENDU', async () => {
    played(TEAM(1), USER(1));
    setTableWriteError('tcg_packs', { message: 'tcg_packs_source_coherent' });

    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [{ teamId: TEAM(1), rank: 1 }],
    });

    expect(report).toMatchObject({
      status: 'granted',
      granted: 1,
      packsExpected: earnReward('tournament_placement', { rank: 1 }).packs,
      packsGranted: 0,
    });
    expect(entries()).toHaveLength(1);
  });

  it('aucun rang dans le barème : `nothing`, sans lecture inutile', async () => {
    played(TEAM(1), USER(1));
    const report = await grantPlacementRewards({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      rankings: [{ teamId: TEAM(1), rank: 9 }],
    });
    expect(report.status).toBe('nothing');
    expect(entries()).toHaveLength(0);
  });
});

/* -----------------------------------------------------------
 * Branchement : la finalisation
 * ---------------------------------------------------------*/

describe('POST /api/admin/tournament/[id]/finalize → palmarès TCG', () => {
  const TID = TOURNAMENT;
  let tokenCounter = 0;

  function makeReq(body: unknown): any {
    tokenCounter += 1;
    return {
      method: 'POST',
      headers: { host: 'h', authorization: `Bearer tcg-${tokenCounter}` },
      query: { id: TID },
      body,
    };
  }
  function makeRes() {
    const res: any = { statusCode: 200, body: undefined, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.setHeader = (k: string, v: unknown) => {
      res.headers[k] = v;
    };
    return res;
  }

  beforeEach(() => {
    invalidateStaffCache();
    setAuthUser({ id: 'user-1' });
    store.staff = [
      {
        id: 'staff-1',
        auth_user_id: 'user-1',
        email: 'a@a.com',
        role: 'admin',
        display_name: null,
        avatar_url: null,
        created_at: '2026-01-01T00:00:00.000Z',
      } satisfies StaffMember,
    ] as never;
    store.tournaments = [
      { id: TID, name: 'Cup 2026', status: 'running' },
    ] as never;
    store.tournament_teams = [
      { tournament_id: TID, team_id: TEAM(1) },
      { tournament_id: TID, team_id: TEAM(2) },
    ] as never;
    store.teams = [
      { id: TEAM(1), name: 'Alpha' },
      { id: TEAM(2), name: 'Bravo' },
    ] as never;
    store.final_rankings = [] as never;
    played(TEAM(1), USER(1));
    played(TEAM(2), USER(2));
  });

  const body = {
    rankings: [
      { team_id: TEAM(1), rank: 1 },
      { team_id: TEAM(2), rank: 2 },
    ],
  };

  it('fige le podium PUIS crédite, et rend le compte rendu dans la réponse', async () => {
    const res = makeRes();
    await finalizeHandler(makeReq(body), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.tcg_placement_rewards).toMatchObject({
      status: 'granted',
      eligible: 2,
      granted: 2,
    });
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(
      earnReward('tournament_placement', { rank: 1 }).packs +
        earnReward('tournament_placement', { rank: 2 }).packs
    );
  });

  it('relancée à l’identique, elle ne crédite personne une seconde fois', async () => {
    await finalizeHandler(makeReq(body), makeRes());
    const packsAfterFirst = packs().length;

    const res = makeRes();
    await finalizeHandler(makeReq(body), res);

    expect(res.body.already_finalized).toBe(true);
    expect(res.body.tcg_placement_rewards).toMatchObject({ granted: 0 });
    expect(entries()).toHaveLength(2);
    expect(packs()).toHaveLength(packsAfterFirst);
  });

  it('refusée (409), elle ne crédite rien', async () => {
    store.tournaments = [{ id: TID, name: 'Cup', status: 'draft' }] as never;
    const res = makeRes();
    await finalizeHandler(makeReq(body), res);

    expect(res.statusCode).toBe(409);
    expect(entries()).toHaveLength(0);
  });
});
