// Demande de scrim GROUPÉE (utils/teams/scrimBroadcast.ts) :
//   - sélection de l'audience (toutes / à mon niveau / qui cherchent), tri,
//     plafond, exclusion de sa propre équipe ;
//   - envoi : une demande par équipe, reliées par `payload.broadcast.id`, SR
//     annoncé, équipes déjà sollicitées sautées, gardes (droit, créneaux) ;
//   - « première qui accepte » : les demandes sœurs en attente sont annulées,
//     une seconde acceptation est refusée.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/discord', () => ({
  notifyScrimRequest: vi.fn(),
  notifyScrimCounterProposal: vi.fn(),
}));
vi.mock('@/utils/scrimRequestNotify', () => ({
  formatScrimDateFr: () => 'mer. 7 oct.',
  notifyScrimRequestEmail: vi.fn(async () => undefined),
  notifyScrimRequestDm: vi.fn(async () => undefined),
}));
vi.mock('@/utils/scrimEvents', () => ({
  emitScrimEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));
const access = {
  current: null as null | { teamId: string; permissions: string[] },
};
vi.mock('@/utils/teams/managementAccess', () => ({
  TEAM_MANAGEMENT_FORBIDDEN: 'Accès réservé.',
  getManagedTeam: vi.fn(async () => access.current),
  assertTeamPermission: (a: { permissions: string[] }, p: string) =>
    a.permissions.includes(p)
      ? null
      : { status: 403, error: 'Droit manquant.' },
}));

import {
  store,
  resetSupabaseMock,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import {
  announcedSrOf,
  broadcastOf,
  selectBroadcastTargets,
  SCRIM_BROADCAST_MAX_TARGETS,
  type BroadcastCandidate,
} from '@/utils/teams/scrimBroadcast';
import {
  previewScrimBroadcast,
  submitScrimBroadcast,
} from '@/features/player/demandes/service/scrimBroadcast';
import { applyScrimRequestAction } from '@/utils/teams/scrimRequestActions';
import { notifyScrimRequestDm } from '@/utils/scrimRequestNotify';
import { notifyScrimRequest } from '@/utils/discord';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MINE = '11111111-1111-4111-8111-111111111111';
const GOLD = '22222222-2222-4222-8222-222222222222';
const PLAT = '33333333-3333-4333-8333-333333333333';
const GM = '44444444-4444-4444-4444-444444444444';
const NOSR = '55555555-5555-4555-8555-555555555555';
const OTHER_TENANT_TEAM = '66666666-6666-4666-8666-666666666666';

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

/* ------------------------------------------------------------------ pur */

const c = (
  id: string,
  skillRating: number | null,
  searching = false,
  name = id
): BroadcastCandidate => ({ id, name, skillRating, searching });

describe('selectBroadcastTargets', () => {
  const all = [
    c('me', 1800),
    c('gold', 1700),
    c('plat', 2200, true),
    c('gm', 4200),
    c('nosr', null),
  ];

  it('toutes : tout le monde sauf soi, cherchant d’abord puis SR le plus proche', () => {
    const r = selectBroadcastTargets(all, {
      myTeamId: 'me',
      audience: 'all',
      referenceSr: 1800,
    });
    expect(r.map((x) => x.id)).toEqual(['plat', 'gold', 'gm', 'nosr']);
  });

  it('à mon niveau : ±1 palier autour du SR de référence, SR inconnu exclu', () => {
    const r = selectBroadcastTargets(all, {
      myTeamId: 'me',
      audience: 'level',
      referenceSr: 1800,
    });
    // Or (1500–1999) ± 1 palier = argent, or, platine.
    expect(r.map((x) => x.id).sort()).toEqual(['gold', 'plat']);
  });

  it('à mon niveau sans SR de référence : personne', () => {
    expect(
      selectBroadcastTargets(all, {
        myTeamId: 'me',
        audience: 'level',
        referenceSr: null,
      })
    ).toEqual([]);
  });

  it('qui cherchent : seulement les recherches en cours', () => {
    const r = selectBroadcastTargets(all, {
      myTeamId: 'me',
      audience: 'searching',
      referenceSr: null,
    });
    expect(r.map((x) => x.id)).toEqual(['plat']);
  });

  it(`plafonné à ${SCRIM_BROADCAST_MAX_TARGETS} destinataires`, () => {
    const many = Array.from({ length: 60 }, (_, i) => c(`t${i}`, 2000));
    expect(
      selectBroadcastTargets(many, {
        myTeamId: 'me',
        audience: 'all',
        referenceSr: 2000,
      })
    ).toHaveLength(SCRIM_BROADCAST_MAX_TARGETS);
  });

  it('lit groupe et SR annoncé depuis le payload', () => {
    expect(
      broadcastOf({
        broadcast: { id: 'b1', audience: 'level', target_count: 3 },
      })
    ).toEqual({
      id: 'b1',
      audience: 'level',
      target_count: 3,
    });
    expect(broadcastOf({})).toBeNull();
    expect(announcedSrOf({ announced_sr: 2450 })).toBe(2450);
    expect(announcedSrOf({ announced_sr: 9000 })).toBeNull();
  });
});

/* -------------------------------------------------------------- service */

function seed() {
  store.teams = [
    {
      id: MINE,
      tenant_id: TENANT,
      name: 'Les Hôtes',
      is_active: true,
      deleted_at: null,
      skill_rating: 1800,
      team_members: [],
    },
    {
      id: GOLD,
      tenant_id: TENANT,
      name: 'Or',
      is_active: true,
      deleted_at: null,
      skill_rating: 1700,
      team_members: [],
    },
    {
      id: PLAT,
      tenant_id: TENANT,
      name: 'Platine',
      is_active: true,
      deleted_at: null,
      skill_rating: 2200,
      team_members: [],
    },
    {
      id: GM,
      tenant_id: TENANT,
      name: 'Grand Maître',
      is_active: true,
      deleted_at: null,
      skill_rating: 4200,
      team_members: [],
    },
    {
      id: NOSR,
      tenant_id: TENANT,
      name: 'Sans SR',
      is_active: true,
      deleted_at: null,
      skill_rating: null,
      team_members: [],
    },
    {
      id: OTHER_TENANT_TEAM,
      tenant_id: '00000000-0000-4000-8000-000000000999',
      name: 'Ailleurs',
      is_active: true,
      deleted_at: null,
      skill_rating: 1800,
      team_members: [],
    },
  ] as any;
  store.scrim_searches = [
    {
      id: 's1',
      tenant_id: TENANT,
      team_id: PLAT,
      status: 'active',
      expires_at: future(2),
    },
  ] as any;
  store.demandes = [] as any;
}

const ctx = () =>
  ({
    db: supabaseAdmin,
    tenantId: TENANT,
    userId: 'u-captain',
    user: {
      id: 'u-captain',
      email: 'cap@example.com',
      user_metadata: { display_name: 'Cap' },
    },
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  }) as any;

beforeEach(() => {
  resetSupabaseMock();
  vi.clearAllMocks();
  access.current = { teamId: MINE, permissions: ['manage_scrims'] };
  seed();
});

describe('aperçu', () => {
  it('rend les destinataires et le SR de l’équipe (pour préremplir)', async () => {
    const r = await previewScrimBroadcast(ctx(), { audience: 'level' }, MINE);
    expect(r.teamSkillRating).toBe(1800);
    expect(r.teams.map((t) => t.name).sort()).toEqual(['Or', 'Platine']);
    expect(r.count).toBe(2);
  });

  it('le SR annoncé déplace l’audience « à mon niveau »', async () => {
    const r = await previewScrimBroadcast(
      ctx(),
      { audience: 'level', announcedSr: 4300 },
      MINE
    );
    expect(r.teams.map((t) => t.name)).toEqual(['Grand Maître']);
  });
});

describe('envoi', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    audience: 'all',
    proposedSlots: [future(7), future(9)],
    message: 'BO3 maps libres',
    announcedSr: 1850,
    ...over,
  });

  it('une demande par équipe du tenant, reliées par un même groupe, SR annoncé', async () => {
    const r = await submitScrimBroadcast(ctx(), body(), MINE);
    expect(r.sent).toBe(4);
    const rows = store.demandes as any[];
    expect(rows.map((d) => d.team_id).sort()).toEqual(
      [GOLD, PLAT, GM, NOSR].sort()
    );
    const ids = new Set(rows.map((d) => d.payload.broadcast.id));
    expect(ids.size).toBe(1);
    for (const d of rows) {
      expect(d).toMatchObject({
        type: 'scrim',
        status: 'pending',
        user_id: 'u-captain',
        tenant_id: TENANT,
      });
      expect(d.payload).toMatchObject({
        from_team_id: MINE,
        announced_sr: 1850,
        broadcast: { audience: 'all', target_count: 4 },
        scrim_nego: { proposed_by: MINE, rounds: 1, agreed_slot: null },
      });
    }
    // MP à chaque destinataire, UN seul message staff.
    expect(vi.mocked(notifyScrimRequestDm)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(notifyScrimRequestDm).mock.calls[0][0].message).toMatch(
      /SR annoncé : 1k8/
    );
    expect(vi.mocked(notifyScrimRequest)).toHaveBeenCalledTimes(1);
  });

  it('saute une équipe déjà sollicitée (demande en attente)', async () => {
    (store.demandes as any[]).push({
      id: 'd-old',
      tenant_id: TENANT,
      team_id: GOLD,
      type: 'scrim',
      status: 'pending',
      user_id: 'u-captain',
      payload: {},
    });
    const r = await submitScrimBroadcast(ctx(), body(), MINE);
    expect(r.sent).toBe(3);
    expect(r.alreadyPending).toBe(1);
  });

  it('refuse sans droit manage_scrims, avec un créneau passé, ou sans destinataire', async () => {
    access.current = { teamId: MINE, permissions: [] };
    await expect(
      submitScrimBroadcast(ctx(), body(), MINE)
    ).rejects.toMatchObject({ status: 403 });

    access.current = { teamId: MINE, permissions: ['manage_scrims'] };
    await expect(
      submitScrimBroadcast(
        ctx(),
        body({
          proposedSlots: [new Date(Date.now() - 3_600_000).toISOString()],
        }),
        MINE
      )
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      submitScrimBroadcast(
        ctx(),
        body({ audience: 'level', announcedSr: 700 }),
        MINE
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(store.demandes as any[]).toHaveLength(0);
  });

  it('400 sur un SR annoncé hors échelle', async () => {
    await expect(
      submitScrimBroadcast(ctx(), body({ announcedSr: 6000 }), MINE)
    ).rejects.toMatchObject({ status: 400 });
  });
});

/* ------------------------------------------------- première qui accepte */

describe('première qui accepte', () => {
  it('annule les demandes sœurs en attente ; une seconde acceptation est refusée', async () => {
    const slot = future(7);
    await submitScrimBroadcast(
      ctx(),
      { audience: 'all', proposedSlots: [slot], announcedSr: 1800 },
      MINE
    );
    const rows = store.demandes as any[];
    const gold = rows.find((d) => d.team_id === GOLD);
    const plat = rows.find((d) => d.team_id === PLAT);

    const first = await applyScrimRequestAction({
      tenantId: TENANT,
      demandeId: gold.id,
      action: 'accept',
      slot,
      actor: { userId: 'u-gold', teamId: GOLD, teamName: 'Or' },
    });
    expect(first.ok, JSON.stringify(first)).toBe(true);

    const byTeam = (id: string) =>
      (store.demandes as any[]).find(
        (d) => d.team_id === id && d.type === 'scrim'
      );
    expect(byTeam(GOLD).status).toBe('approved');
    for (const other of [PLAT, GM, NOSR]) {
      expect(byTeam(other).status).toBe('cancelled');
      expect(byTeam(other).staff_note).toMatch(/pris par Or/);
    }

    const second = await applyScrimRequestAction({
      tenantId: TENANT,
      demandeId: plat.id,
      action: 'accept',
      slot,
      actor: { userId: 'u-plat', teamId: PLAT, teamName: 'Platine' },
    });
    expect(second.ok).toBe(false);
    expect((store.scrims as any[] | undefined)?.length ?? 0).toBe(1);
  });

  it('une demande simple n’annule rien d’autre', async () => {
    const slot = future(5);
    store.demandes = [
      {
        id: 'd-simple',
        tenant_id: TENANT,
        team_id: GOLD,
        type: 'scrim',
        status: 'pending',
        user_id: 'u-captain',
        comment: null,
        payload: {
          from_team_id: MINE,
          from_team_name: 'Les Hôtes',
          target_team_name: 'Or',
          scrim_nego: {
            slots: [slot],
            proposed_by: MINE,
            rounds: 1,
            agreed_slot: null,
          },
        },
      },
      {
        id: 'd-other',
        tenant_id: TENANT,
        team_id: PLAT,
        type: 'scrim',
        status: 'pending',
        user_id: 'u-captain',
        comment: null,
        payload: {
          from_team_id: MINE,
          scrim_nego: {
            slots: [slot],
            proposed_by: MINE,
            rounds: 1,
            agreed_slot: null,
          },
        },
      },
    ] as any;
    const r = await applyScrimRequestAction({
      tenantId: TENANT,
      demandeId: 'd-simple',
      action: 'accept',
      slot,
      actor: { userId: 'u-gold', teamId: GOLD, teamName: 'Or' },
    });
    expect(r.ok).toBe(true);
    expect(
      (store.demandes as any[]).find((d) => d.id === 'd-other').status
    ).toBe('pending');
  });
});
