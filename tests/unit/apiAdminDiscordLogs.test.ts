// Tests for /api/admin/discord-logs — the "Discord" tab of /admin/logs.
//
// Covered :
//   - source=player : happy path, tenant scoping, Discord username resolution
//     via user_discord_links, action/actor filters
//   - source=event  : outbox rows normalised (status / attempts / delivery)
//   - validation    : bad Discord snowflake and bad status → 400
//   - CSV export    : content-type + header row
//   - method allow-list (POST → 405)
//
// Note : the in-memory supabase mock treats `.or()` as a no-op, so the
// free-text `search` param is not exercised end-to-end here.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import discordLogsHandler from '../../pages/api/admin/discord-logs';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(role: 'admin' = 'admin'): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshToken() {
  _tokenCounter += 1;
  return `t-${Date.now()}-${_tokenCounter}`;
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    query: {},
    body: {},
    cookies: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    ended: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = (b?: unknown) => ((res.ended = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

// DEFAULT_TENANT_ID literal — matches utils/tenant.ts default fallback.
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';

const ACTOR_DISCORD = '111111111111111111';
const TARGET_DISCORD = '222222222222222222';

function seedPlayerActions() {
  store.bot_player_actions = [
    {
      id: 2,
      tenant_id: TENANT,
      created_at: '2026-08-02T10:00:00.000Z',
      action: 'kick_member',
      entity_type: 'team',
      entity_id: 'team-a',
      actor_auth_user_id: 'user-captain',
      actor_discord_user_id: ACTOR_DISCORD,
      target_auth_user_id: 'user-kicked',
      target_discord_user_id: TARGET_DISCORD,
      payload: { reason: 'inactive' },
    },
    {
      id: 1,
      tenant_id: TENANT,
      created_at: '2026-08-01T10:00:00.000Z',
      action: 'checkin',
      entity_type: 'match',
      entity_id: 'match-1',
      actor_auth_user_id: 'user-captain',
      actor_discord_user_id: ACTOR_DISCORD,
      target_auth_user_id: null,
      target_discord_user_id: null,
      payload: null,
    },
    // Autre tenant — DOIT etre exclu.
    {
      id: 3,
      tenant_id: OTHER_TENANT,
      created_at: '2026-08-03T10:00:00.000Z',
      action: 'create_team',
      entity_type: 'team',
      entity_id: 'team-foreign',
      actor_auth_user_id: 'user-foreign',
      actor_discord_user_id: '333333333333333333',
      target_auth_user_id: null,
      target_discord_user_id: null,
      payload: null,
    },
  ] as any;

  store.user_discord_links = [
    {
      auth_user_id: 'user-captain',
      discord_user_id: ACTOR_DISCORD,
      discord_username: 'capitaine',
    },
    {
      auth_user_id: 'user-kicked',
      discord_user_id: TARGET_DISCORD,
      discord_username: 'remplacante',
    },
  ] as any;
}

function seedOutbox() {
  store.bot_event_outbox = [
    {
      id: 10,
      tenant_id: TENANT,
      created_at: '2026-08-02T12:00:00.000Z',
      event_id: 'evt-failed',
      event_name: 'match.starting',
      status: 'failed',
      push_attempts: 3,
      last_push_error: 'ECONNREFUSED',
      delivered_at: null,
      payload: { matchId: 'match-1' },
    },
    {
      id: 9,
      tenant_id: TENANT,
      created_at: '2026-08-01T12:00:00.000Z',
      event_id: 'evt-ok',
      event_name: 'team.created',
      status: 'delivered',
      push_attempts: 1,
      last_push_error: null,
      delivered_at: '2026-08-01T12:00:01.000Z',
      payload: { teamId: 'team-a' },
    },
    {
      id: 11,
      tenant_id: OTHER_TENANT,
      created_at: '2026-08-03T12:00:00.000Z',
      event_id: 'evt-foreign',
      event_name: 'news.published',
      status: 'pending',
      push_attempts: 0,
      last_push_error: null,
      delivered_at: null,
      payload: {},
    },
  ] as any;
}

type Body = {
  logs: Array<{
    id: string;
    source: string;
    action: string;
    action_label: string;
    entity_type: string | null;
    entity_id: string | null;
    actor: {
      discordUserId: string | null;
      discordUsername: string | null;
    } | null;
    target: { discordUsername: string | null } | null;
    status: string | null;
    push_attempts: number | null;
    last_push_error: string | null;
  }>;
  total: number | null;
};

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
});

/* -----------------------------------------------------------
 * Specs
 * ---------------------------------------------------------*/

describe('GET /api/admin/discord-logs — source=player', () => {
  it('returns player actions of the active tenant, newest first, with resolved usernames', async () => {
    seedPlayerActions();

    const res = makeRes();
    await discordLogsHandler(makeAuthedReq({ query: {} }), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as Body;
    expect(body.logs.map((l) => l.id)).toEqual(['player:2', 'player:1']);
    expect(body.logs.every((l) => l.source === 'player')).toBe(true);

    const kick = body.logs[0];
    expect(kick.action).toBe('kick_member');
    // Libellé FR issu de utils/discordLogs (partagé UI + export CSV).
    expect(kick.action_label).toBe('Membre exclu');
    expect(kick.actor?.discordUsername).toBe('capitaine');
    expect(kick.target?.discordUsername).toBe('remplacante');
    // Champs propres a la source 'event' : nuls ici.
    expect(kick.status).toBeNull();
    expect(kick.push_attempts).toBeNull();

    // Le check-in n'a pas de cible : `target` doit etre null (et non un objet vide).
    expect(body.logs[1].target).toBeNull();
  });

  it('filters by action and by actor Discord id', async () => {
    seedPlayerActions();

    const byAction = makeRes();
    await discordLogsHandler(
      makeAuthedReq({ query: { action: 'checkin' } }),
      byAction
    );
    expect((byAction.body as Body).logs.map((l) => l.id)).toEqual(['player:1']);

    const byActor = makeRes();
    await discordLogsHandler(
      makeAuthedReq({ query: { actorDiscordUserId: ACTOR_DISCORD } }),
      byActor
    );
    expect((byActor.body as Body).logs).toHaveLength(2);
  });

  it('rejects a malformed Discord id with 400', async () => {
    const res = makeRes();
    await discordLogsHandler(
      makeAuthedReq({ query: { actorDiscordUserId: 'not-a-snowflake' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/admin/discord-logs — source=event', () => {
  it('normalises outbox rows with delivery state', async () => {
    seedOutbox();

    const res = makeRes();
    await discordLogsHandler(
      makeAuthedReq({ query: { source: 'event' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as Body;
    expect(body.logs.map((l) => l.id)).toEqual(['event:10', 'event:9']);

    const failed = body.logs[0];
    expect(failed.source).toBe('event');
    expect(failed.action).toBe('match.starting');
    expect(failed.status).toBe('failed');
    expect(failed.push_attempts).toBe(3);
    expect(failed.last_push_error).toBe('ECONNREFUSED');
    // L'outbox n'a pas d'entite typee : on expose l'event_id (cle d'idempotence).
    expect(failed.entity_type).toBe('event_id');
    expect(failed.entity_id).toBe('evt-failed');
    // Pas d'acteur humain sur un event sortant.
    expect(failed.actor).toBeNull();
  });

  it('filters by delivery status and rejects an unknown one', async () => {
    seedOutbox();

    const ok = makeRes();
    await discordLogsHandler(
      makeAuthedReq({ query: { source: 'event', status: 'delivered' } }),
      ok
    );
    expect((ok.body as Body).logs.map((l) => l.id)).toEqual(['event:9']);

    const bad = makeRes();
    await discordLogsHandler(
      makeAuthedReq({ query: { source: 'event', status: 'exploded' } }),
      bad
    );
    expect(bad.statusCode).toBe(400);
  });
});

describe('GET /api/admin/discord-logs — misc', () => {
  it('exports CSV with a header row', async () => {
    seedPlayerActions();

    const res = makeRes();
    await discordLogsHandler(makeAuthedReq({ query: { format: 'csv' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8');
    const csv = String(res.ended);
    expect(csv.split('\r\n')[0]).toContain('date,source,action,action_label');
    expect(csv).toContain('Membre exclu');
  });

  it('rejects non-GET methods', async () => {
    const res = makeRes();
    await discordLogsHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
