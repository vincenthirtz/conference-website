// tests/unit/apiBotMatchScore.test.ts
//
// LA SAISIE DE SCORE PAR LE STAFF — celle qui S'IMPOSE.
//
// Cette route finalise un match et propage un bracket sur la foi d'un seul
// geste. Ce que ces tests protègent, dans l'ordre d'importance :
//
//   1. QUI. L'identité est prouvée, pas déclarée : un compte Discord non lié,
//      ou lié à un `caster`, ne doit rien pouvoir finaliser. C'est la seule
//      barrière de la route.
//   2. LA TRACE. Un score autoritaire ne laisse aucune marque naturelle — le
//      match finit « terminé », comme s'il s'était conclu tout seul. Sans
//      journal, une erreur de saisie serait indiscernable d'un vrai résultat.
//   3. LA FAUTE DE FRAPPE. Un 4-0 sur un Bo3, une égalité : refusés. Ce sont
//      les erreurs qu'on commet à une main, en direct, entre deux annonces.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const applyMatchScore = vi.fn();
vi.mock('@/utils/matches/applyScore', () => ({
  applyMatchScore: (...args: unknown[]) => applyMatchScore(...args),
  MatchFinalizationConflictError: class extends Error {},
}));

const logStaffAction = vi.fn().mockResolvedValue(undefined);
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: (...args: unknown[]) => logStaffAction(...args),
}));

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';

import handler from '../../pages/api/bot/v1/matches/[matchId]/score';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const MATCH = '11111111-1111-4111-8111-111111111111';
const BYE = '11111111-1111-4111-8111-1111111111bb';
const TEAM_A = '22222222-2222-4222-8222-2222222222aa';
const TEAM_B = '22222222-2222-4222-8222-2222222222bb';

const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';
const ADMIN_DISCORD = '900000000000000001';
const CASTER_DISCORD = '900000000000000002';
const INCONNU_DISCORD = '900000000000000003';

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

async function call(body: Record<string, unknown>, matchId = MATCH) {
  _n += 1;
  const req: any = {
    method: 'POST',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-nf-client-connection-ip': `10.4.${Math.floor(_n / 250)}.${_n % 250}`,
    },
    cookies: {},
    query: { matchId },
    body,
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const saisir = (over: Record<string, unknown> = {}) =>
  call({
    actorDiscordUserId: ADMIN_DISCORD,
    team1Score: 2,
    team2Score: 1,
    ...over,
  });

function seed(staffRole: 'admin' | 'owner' | 'caster' = 'admin') {
  store.tenants = [
    {
      id: TENANT,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;
  store.matches = [
    {
      id: MATCH,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'ongoing',
      round_name: 'J1',
      team1_id: TEAM_A,
      team2_id: TEAM_B,
      is_bye: false,
      best_of: 3,
      match_format: 'bo3',
    },
    {
      id: BYE,
      tenant_id: TENANT,
      tournament_id: null,
      status: 'finished',
      round_name: 'J1',
      team1_id: TEAM_A,
      team2_id: null,
      is_bye: true,
      best_of: 3,
      match_format: 'bo3',
    },
  ] as any;
  store.staff = [
    { id: STAFF_ROW, auth_user_id: STAFF_AUTH, role: staffRole },
  ] as any;
  store.user_discord_links = [
    { discord_user_id: ADMIN_DISCORD, auth_user_id: STAFF_AUTH },
    // Lié à un compte SANS ligne staff : une joueuse, pas du staff.
    { discord_user_id: CASTER_DISCORD, auth_user_id: 'autre-compte' },
  ] as any;
}

describe('/api/bot/v1/matches/[matchId]/score', () => {
  beforeEach(() => {
    resetSupabaseMock();
    seedBotAuth({ tenantId: TENANT, apiKey: 'test-key' });
    seed();
    applyMatchScore.mockReset();
    applyMatchScore.mockResolvedValue({
      winnerTeamId: TEAM_A,
      match: { team1_score: 2, team2_score: 1, status: 'finished' },
    });
    logStaffAction.mockClear();
  });

  it('un admin lié finalise le match', async () => {
    const res = await saisir();
    expect(res.statusCode).toBe(200);
    expect(res.body.winnerTeamId).toBe(TEAM_A);
    expect(applyMatchScore).toHaveBeenCalledTimes(1);
    const arg = applyMatchScore.mock.calls[0][0];
    expect(arg.team1Score).toBe(2);
    expect(arg.winnerTeamId).toBe(TEAM_A);
    // Le bracket se propage : c'est tout l'intérêt d'une saisie autoritaire.
    expect(arg.propagateBracket).toBe(true);
    expect(arg.staffId).toBe(STAFF_ROW);
  });

  it('LAISSE UNE TRACE, sans quoi la saisie serait invisible', async () => {
    await saisir();
    expect(logStaffAction).toHaveBeenCalledTimes(1);
    const log = logStaffAction.mock.calls[0][0];
    expect(log.action).toBe('update_match');
    expect(log.entity_id).toBe(MATCH);
    expect(log.payload.action_type).toBe('staff_score');
    expect(log.payload.team1Score).toBe(2);
    // `via: 'discord_bot'` est ajouté par le helper : on saura d'où ça vient.
    expect(log.payload.via).toBe('discord_bot');
  });

  it('un compte Discord NON LIÉ ne finalise rien', async () => {
    const res = await saisir({ actorDiscordUserId: INCONNU_DISCORD });
    expect(res.statusCode).toBe(403);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('un compte lié SANS rôle staff ne finalise rien', async () => {
    const res = await saisir({ actorDiscordUserId: CASTER_DISCORD });
    expect(res.statusCode).toBe(403);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('un CASTER est refusé — il n’a que le cockpit', async () => {
    seed('caster');
    const res = await saisir();
    expect(res.statusCode).toBe(403);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('refuse un score impossible pour le format', async () => {
    // 4-0 sur un Bo3 : presque toujours une faute de frappe.
    const res = await saisir({ team1Score: 4, team2Score: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_SCORE_FOR_FORMAT');
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('accepte une série abandonnée quand on le DIT', async () => {
    const res = await saisir({
      team1Score: 1,
      team2Score: 0,
      allowIncompleteSeries: true,
    });
    expect(res.statusCode).toBe(200);
    expect(applyMatchScore.mock.calls[0][0].allowIncompleteSeries).toBe(true);
  });

  it('refuse une égalité', async () => {
    const res = await saisir({ team1Score: 1, team2Score: 1 });
    expect(res.statusCode).toBe(400);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('refuse un bye', async () => {
    const res = await call(
      { actorDiscordUserId: ADMIN_DISCORD, team1Score: 2, team2Score: 1 },
      BYE
    );
    expect(res.statusCode).toBe(400);
    expect(applyMatchScore).not.toHaveBeenCalled();
  });

  it('signale qu’un litige vient d’être tranché', async () => {
    (store.matches as any)[0].status = 'disputed';
    const res = await saisir();
    expect(res.statusCode).toBe(200);
    expect(res.body.resolvedDispute).toBe(true);
  });

  it('désigne l’équipe 2 quand elle l’emporte', async () => {
    applyMatchScore.mockResolvedValue({
      winnerTeamId: TEAM_B,
      match: { team1_score: 1, team2_score: 2, status: 'finished' },
    });
    await saisir({ team1Score: 1, team2Score: 2 });
    expect(applyMatchScore.mock.calls[0][0].winnerTeamId).toBe(TEAM_B);
  });
});
