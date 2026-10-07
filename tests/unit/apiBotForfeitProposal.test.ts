// tests/unit/apiBotForfeitProposal.test.ts
//
// Boutons du DM « proposition de forfait » :
//   POST /api/bot/v1/matches/:matchId/forfeit-proposal/confirm
//   POST /api/bot/v1/matches/:matchId/forfeit-proposal/decline
//
// Ce qui compte, dans l'ordre :
//   1. QUI. Admin/owner DU TENANT (rôle effectif), sinon 403. Un admin global
//      sans rattachement à l'espace n'a pas à trancher ses matchs.
//   2. Confirmer applique le forfait de l'équipe ABSENTE, au nom de l'admin.
//   3. Un second clic (ou l'autre admin) reçoit 409 avec l'état courant.
//   4. La trace staff.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const applyMatchScore = vi.fn();
vi.mock('../../utils/matches/applyScore', () => ({
  applyMatchScore: (...args: unknown[]) => applyMatchScore(...args),
  MatchFinalizationConflictError: class extends Error {},
}));

const logStaffAction = vi.fn().mockResolvedValue(undefined);
vi.mock('../../utils/staffLogs', () => ({
  logStaffAction: (...args: unknown[]) => logStaffAction(...args),
}));
vi.mock('../../utils/discord', () => ({
  notifyCheckinForfeit: vi.fn(async () => undefined),
  notifyCheckinReminder: vi.fn(async () => undefined),
  notifyCheckinOpened: vi.fn(async () => undefined),
  notifyCheckinCancelledNoShow: vi.fn(async () => undefined),
  notifyLineupReminder: vi.fn(async () => undefined),
}));
vi.mock('../../utils/email', () => ({
  sendMatchCheckinEmail: vi.fn(async () => ({ ok: true })),
  sendCheckinReminderEmail: vi.fn(async () => ({ ok: true })),
  sendCheckinForfeitEmail: vi.fn(async () => ({ ok: true })),
  sendCheckinCancelledEmail: vi.fn(async () => ({ ok: true })),
}));

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import {
  __resetTenantRoleCacheForTests,
  invalidateTenantAccessCache,
} from '../../utils/adminTenants';

import confirmHandler from '../../pages/api/bot/v1/matches/[matchId]/forfeit-proposal/confirm';
import declineHandler from '../../pages/api/bot/v1/matches/[matchId]/forfeit-proposal/decline';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '7d1b9a52-3f6e-4c1a-9d2b-0a1b2c3d4e5f';
const MATCH = '11111111-1111-4111-8111-111111111111';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';

const ADMIN_DISCORD = '900000000000000001';
const FOREIGN_ADMIN_DISCORD = '900000000000000002';
const ELEVATED_DISCORD = '900000000000000003';
const UNLINKED_DISCORD = '900000000000000009';

let _n = 0;
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

async function call(
  handler: (req: any, res: any) => unknown,
  body: Record<string, unknown>
) {
  _n += 1;
  const req: any = {
    method: 'POST',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-nf-client-connection-ip': `10.7.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: { matchId: MATCH },
    body,
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const confirm = (actorDiscordUserId: string) =>
  call(confirmHandler, { actorDiscordUserId });
const decline = (actorDiscordUserId: string) =>
  call(declineHandler, { actorDiscordUserId });

function seed() {
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'pending',
      is_bye: false,
      match_format: 'bo3',
      scheduled_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      team1_checked_in_at: '2026-10-07T17:30:00.000Z',
      team2_checked_in_at: null,
      forfeit_processed_at: '2026-10-07T18:01:00.000Z',
      forfeit_proposed_team_id: TEAM_B,
      forfeit_proposed_at: '2026-10-07T18:01:00.000Z',
      forfeit_proposal_status: 'pending',
      forfeit_proposal_resolved_by: null,
      forfeit_proposal_resolved_at: null,
    },
  ] as any;
  store.staff = [
    { id: 's-admin', auth_user_id: 'u-admin', role: 'admin' },
    // Admin GLOBAL, mais rattaché à un autre espace seulement.
    { id: 's-foreign', auth_user_id: 'u-foreign', role: 'admin' },
    // Caster global, owner de CET espace (onboarding self-service).
    { id: 's-elevated', auth_user_id: 'u-elevated', role: 'caster' },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 's-admin', role: 'admin' },
    { tenant_id: OTHER_TENANT, staff_id: 's-foreign', role: 'admin' },
    { tenant_id: TENANT, staff_id: 's-elevated', role: 'owner' },
  ] as any;
  store.user_discord_links = [
    { discord_user_id: ADMIN_DISCORD, auth_user_id: 'u-admin' },
    { discord_user_id: FOREIGN_ADMIN_DISCORD, auth_user_id: 'u-foreign' },
    { discord_user_id: ELEVATED_DISCORD, auth_user_id: 'u-elevated' },
  ] as any;
}

describe('/api/bot/v1/matches/[matchId]/forfeit-proposal/{confirm,decline}', () => {
  beforeEach(() => {
    resetSupabaseMock();
    invalidateTenantAccessCache();
    __resetTenantRoleCacheForTests();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
    applyMatchScore.mockReset();
    applyMatchScore.mockImplementation(async () => {
      const m = store.matches[0] as any;
      Object.assign(m, {
        status: 'walkover',
        team1_score: 2,
        team2_score: 0,
        winner_team_id: TEAM_A,
        forfeit_team_id: TEAM_B,
      });
      return { winnerTeamId: TEAM_A, match: { ...m } };
    });
    logStaffAction.mockClear();
  });

  it('un admin du tenant confirme : forfait de l’équipe ABSENTE, à son nom', async () => {
    const res = await confirm(ADMIN_DISCORD);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      matchId: MATCH,
      outcome: 'confirmed',
      proposal: { status: 'confirmed', absentTeamId: TEAM_B },
      match: {
        status: 'walkover',
        team1Score: 2,
        team2Score: 0,
        winnerTeamId: TEAM_A,
      },
    });
    expect(applyMatchScore).toHaveBeenCalledTimes(1);
    expect(applyMatchScore.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT,
      matchId: MATCH,
      forfeitTeamId: TEAM_B,
      staffId: 's-admin',
      propagateBracket: true,
    });
    const log = logStaffAction.mock.calls.find(
      (c) => c[0].payload?.subject === 'forfeit_proposal'
    )?.[0];
    expect(log).toMatchObject({
      action: 'update_match',
      entity_id: MATCH,
      payload: { decision: 'confirmed', via: 'discord_bot' },
    });
  });

  it('un second clic reçoit 409 FORFEIT_PROPOSAL_NOT_PENDING avec l’état courant', async () => {
    expect((await confirm(ADMIN_DISCORD)).statusCode).toBe(200);
    const res = await decline(ELEVATED_DISCORD);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'FORFEIT_PROPOSAL_NOT_PENDING',
      proposal: { status: 'confirmed' },
    });
    expect(applyMatchScore).toHaveBeenCalledTimes(1);
  });

  it('refuser ne touche pas au match', async () => {
    const res = await decline(ADMIN_DISCORD);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      outcome: 'declined',
      proposal: { status: 'declined' },
      match: null,
    });
    expect(applyMatchScore).not.toHaveBeenCalled();
    expect((store.matches[0] as any).status).toBe('pending');
  });

  it('un owner de l’espace au rôle global inférieur peut trancher', async () => {
    const res = await decline(ELEVATED_DISCORD);
    expect(res.statusCode).toBe(200);
  });

  it('403 pour un admin d’un AUTRE espace, et pour un compte non lié', async () => {
    for (const id of [FOREIGN_ADMIN_DISCORD, UNLINKED_DISCORD]) {
      const res = await confirm(id);
      expect(res.statusCode).toBe(403);
    }
    expect(applyMatchScore).not.toHaveBeenCalled();
    expect((store.matches[0] as any).forfeit_proposal_status).toBe('pending');
  });

  it('400 INVALID_BODY sans actorDiscordUserId', async () => {
    const res = await call(confirmHandler, {});
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });
});
