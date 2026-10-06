// Lot P7 — verrou de roster en self-service : état exposé à la capitaine
// (GET /api/player/team) et demande de dérogation (ticket support typé).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/discord', () => ({
  notifySupportTicket: vi.fn(async () => ({ messageId: null })),
}));

import {
  resetSupabaseMock,
  setAdminUser,
  store,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { notifySupportTicket } from '@/utils/discord';
import {
  loadRosterLockView,
  requestRosterUnlock,
} from '@/features/player/team/service/rosterUnlock';
import { RosterUnlockRequestBody } from '@/features/player/team/rosterUnlock/schemas';
import {
  ROSTER_UNLOCK_SUBJECT_PREFIX,
  readRosterLockView,
  toRosterLockView,
} from '@/utils/teams/rosterLockView';

const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const TOURNAMENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PAST = '2026-01-15T10:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
};

function ctx(db: unknown = supabaseAdmin) {
  return {
    db,
    tenantId: TENANT_ID,
    logger,
    subject: {
      userId: USER_ID,
      tenantId: TENANT_ID,
      callerId: USER_ID,
      isInspection: false,
      staffId: null,
      staffRole: null,
      isActingAs: false,
    },
    team: {
      teamId: TEAM_ID,
      isCaptain: true,
      isManager: false,
      grantedPermissions: [],
      permissions: ['manage_roster'],
    },
  } as any;
}

function seedLocked(opts: { unlockedUntil?: string | null } = {}) {
  store.teams = [{ id: TEAM_ID, tenant_id: TENANT_ID, name: 'Alpha' }] as any;
  store.tournament_teams = [
    { tournament_id: TOURNAMENT_ID, team_id: TEAM_ID, tenant_id: TENANT_ID },
  ] as any;
  store.tournaments = [
    {
      id: TOURNAMENT_ID,
      tenant_id: TENANT_ID,
      name: 'Coupe',
      roster_locked_at: PAST,
      roster_unlocked_until: opts.unlockedUntil ?? null,
      status: 'ongoing',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  vi.mocked(notifySupportTicket).mockClear();
  logger.error.mockClear();
  setAdminUser(USER_ID, 'Cap@Example.com', {
    user_metadata: { display_name: 'Capi' },
  });
});

describe('toRosterLockView / readRosterLockView', () => {
  it('verrouillé : tournoi, date, demande en attente', () => {
    const view = toRosterLockView(
      {
        locked: true,
        tournamentId: 't',
        tournamentName: 'Coupe',
        lockedAt: PAST,
      },
      { ticketId: 'x', createdAt: PAST }
    );
    expect(view).toEqual({
      locked: true,
      tournamentId: 't',
      tournamentName: 'Coupe',
      lockedAt: PAST,
      unlockedUntil: null,
      pendingRequest: { ticketId: 'x', createdAt: PAST },
    });
  });

  it('fenêtre ouverte : non verrouillé, avec échéance', () => {
    const view = toRosterLockView({
      locked: false,
      unlockedUntil: FUTURE,
      unlockedTournamentId: 't',
      unlockedTournamentName: 'Coupe',
    });
    expect(view.locked).toBe(false);
    expect(view.unlockedUntil).toBe(FUTURE);
    expect(view.pendingRequest).toBeNull();
  });

  it('lecture client défensive : champ absent ou malformé → null', () => {
    expect(readRosterLockView(undefined)).toBeNull();
    expect(readRosterLockView({ locked: 'yes' })).toBeNull();
    expect(
      readRosterLockView({
        locked: true,
        lockedAt: PAST,
        pendingRequest: { ticketId: 1 },
      })
    ).toMatchObject({ locked: true, lockedAt: PAST, pendingRequest: null });
  });
});

describe('RosterUnlockRequestBody', () => {
  it('exige un motif d’au moins 10 caractères', () => {
    expect(RosterUnlockRequestBody.safeParse({ reason: 'court' }).success).toBe(
      false
    );
    expect(RosterUnlockRequestBody.safeParse({}).success).toBe(false);
    const ok = RosterUnlockRequestBody.safeParse({
      reason: '  Notre support est blessée  ',
    });
    expect(ok.success && ok.data.reason).toBe('Notre support est blessée');
  });
});

describe('loadRosterLockView', () => {
  it('roster libre : locked=false, sans échéance', async () => {
    const view = await loadRosterLockView(supabaseAdmin as any, TENANT_ID, {
      id: TEAM_ID,
      name: 'Alpha',
    });
    expect(view).toMatchObject({ locked: false, unlockedUntil: null });
  });

  it('roster verrouillé : date du verrou et demande en attente', async () => {
    seedLocked();
    store.support_tickets = [
      {
        id: 'tk-1',
        tenant_id: TENANT_ID,
        tournament_id: TOURNAMENT_ID,
        category: 'roster_unlock',
        status: 'open',
        reported_target_type: 'team',
        reported_target_name: 'Alpha',
        subject: `${ROSTER_UNLOCK_SUBJECT_PREFIX} Alpha`,
        created_at: PAST,
      },
    ] as any;
    const view = await loadRosterLockView(supabaseAdmin as any, TENANT_ID, {
      id: TEAM_ID,
      name: 'Alpha',
    });
    expect(view).toMatchObject({
      locked: true,
      lockedAt: PAST,
      tournamentName: 'Coupe',
      pendingRequest: { ticketId: 'tk-1', createdAt: PAST },
    });
  });

  it('une demande RÉSOLUE ne compte plus comme en attente', async () => {
    seedLocked();
    store.support_tickets = [
      {
        id: 'tk-old',
        tenant_id: TENANT_ID,
        tournament_id: TOURNAMENT_ID,
        category: 'roster_unlock',
        status: 'resolved',
        reported_target_type: 'team',
        reported_target_name: 'Alpha',
        subject: `${ROSTER_UNLOCK_SUBJECT_PREFIX} Alpha`,
        created_at: PAST,
      },
    ] as any;
    const view = await loadRosterLockView(supabaseAdmin as any, TENANT_ID, {
      id: TEAM_ID,
      name: 'Alpha',
    });
    expect(view?.pendingRequest).toBeNull();
  });

  it('fenêtre de dérogation ouverte : déverrouillé jusqu’à son échéance', async () => {
    seedLocked({ unlockedUntil: FUTURE });
    const view = await loadRosterLockView(supabaseAdmin as any, TENANT_ID, {
      id: TEAM_ID,
      name: 'Alpha',
    });
    expect(view).toMatchObject({ locked: false, unlockedUntil: FUTURE });
  });
});

describe('requestRosterUnlock', () => {
  const body = { reason: 'Notre support est blessée, remplaçante prête.' };

  it('crée un ticket roster_unlock visible du staff et notifie Discord', async () => {
    seedLocked();
    const res = await requestRosterUnlock(ctx(), body);

    expect(res.success).toBe(true);
    const tickets = store.support_tickets as any[];
    expect(tickets).toHaveLength(1);
    const t = tickets[0];
    expect(t).toMatchObject({
      tenant_id: TENANT_ID,
      tournament_id: TOURNAMENT_ID,
      category: 'roster_unlock',
      status: 'open',
      reporter_user_id: USER_ID,
      reporter_email: 'cap@example.com',
      reporter_name: 'Capi',
      reported_target_type: 'team',
      reported_target_name: 'Alpha',
      subject: `${ROSTER_UNLOCK_SUBJECT_PREFIX} Alpha`,
    });
    expect(t.message).toContain(body.reason);
    expect(t.message).toContain(`/admin/teams/${TEAM_ID}`);
    // Date du verrou dans le fuseau du site (11:00 à Paris, pas 10:00 UTC).
    expect(t.message).toContain('15/01/2026 11:00');
    expect(res.request.ticketId).toBe(t.id);
    expect(notifySupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'roster_unlock', ticketId: t.id })
    );
  });

  it('409 roster_not_locked quand le roster est libre', async () => {
    store.teams = [{ id: TEAM_ID, tenant_id: TENANT_ID, name: 'Alpha' }] as any;
    await expect(requestRosterUnlock(ctx(), body)).rejects.toMatchObject({
      status: 409,
      legacyCode: 'roster_not_locked',
    });
    expect(store.support_tickets ?? []).toHaveLength(0);
  });

  it('409 quand une demande est déjà en attente — pas de doublon', async () => {
    seedLocked();
    await requestRosterUnlock(ctx(), body);
    (store.support_tickets as any[])[0].created_at = PAST;
    await expect(requestRosterUnlock(ctx(), body)).rejects.toMatchObject({
      status: 409,
      legacyCode: 'roster_unlock_already_requested',
    });
    expect(store.support_tickets).toHaveLength(1);
  });

  it('404 quand l’équipe n’existe pas dans le tenant', async () => {
    await expect(requestRosterUnlock(ctx(), body)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('migration absente : repli en catégorie other, sujet préfixé', async () => {
    seedLocked();
    // La contrainte CHECK d'origine refuse `roster_unlock`.
    const db = {
      auth: supabaseAdmin.auth,
      from(table: string) {
        const builder = (supabaseAdmin as any).from(table);
        if (table !== 'support_tickets') return builder;
        const insert = builder.insert.bind(builder);
        builder.insert = (row: any) => {
          if (row.category === 'roster_unlock') {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '23514', message: 'check constraint' },
                }),
              }),
            };
          }
          return insert(row);
        };
        return builder;
      },
    };
    const res = await requestRosterUnlock(ctx(db), body);
    expect(res.success).toBe(true);
    const tickets = store.support_tickets as any[];
    expect(tickets).toHaveLength(1);
    expect(tickets[0].category).toBe('other');
    expect(tickets[0].subject.startsWith(ROSTER_UNLOCK_SUBJECT_PREFIX)).toBe(
      true
    );
    expect(notifySupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'other' })
    );
  });
});
