// tests/unit/apiAdminTenantOverview.test.ts
//
// GET /api/admin/tenants/[id]/overview — « il se passe quoi dans cet espace ? »
//
// Ce que ces tests protègent :
//   - le cloisonnement : un compteur qui déborde sur un autre espace ferait
//     paraître vivant un espace mort, ce qui est pire que pas de chiffre ;
//   - la distinction `null` (lecture indisponible) / `0` (il n'y a rien) —
//     c'est toute la valeur d'un écran de supervision ;
//   - les manques, calculés par les règles PARTAGÉES avec le hub d'onboarding.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import handler from '../../pages/api/admin/tenants/[id]/overview';

const TENANT = CONFERENCE_TENANT_ID;
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'user-1';

let _t = 0;
function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
    cookies: {},
    query: { id: TENANT },
    body: {},
    ...over,
  };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: USER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'a@a.com',
      role: 'owner',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    {
      id: TENANT,
      slug: 'conf',
      name: 'Conf',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
      plan_is_trial: false,
    },
    {
      id: OTHER,
      slug: 'autre',
      name: 'Autre',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      plan: 'discovery',
      plan_status: 'active',
      plan_expires_at: null,
      plan_is_trial: false,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: 'staff-1', role: 'owner' },
  ] as any;
  store.discord_guilds = [
    { tenant_id: TENANT, guild_id: '111111111111111111', is_primary: true },
  ] as any;
  store.tenant_discord_config = [
    { guild_id: '111111111111111111', staff_log_channel_id: '999' },
  ] as any;
  store.integration_secrets = [
    { tenant_id: TENANT, key: 'brevo_api_key', value_encrypted: 'x' },
  ] as any;
  store.teams = [] as any;
  store.team_members = [] as any;
  store.tournaments = [] as any;
  store.matches = [] as any;
  store.support_tickets = [] as any;
  store.bot_event_outbox = [] as any;
  store.staff_logs = [] as any;
  store.api_usage_counters = [] as any;
});

describe('GET /api/admin/tenants/[id]/overview', () => {
  it('ne compte que les lignes de CET espace', async () => {
    store.teams = [
      { id: 't1', tenant_id: TENANT, name: 'Alpha' },
      { id: 't2', tenant_id: TENANT, name: 'Beta' },
      // L'intruse : sans le filtre, l'espace paraîtrait plus peuplé.
      { id: 't3', tenant_id: OTHER, name: 'Ailleurs' },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).volumes.teams).toBe(2);
  });

  it('date le dernier signe de vie, et ignore ceux des autres espaces', async () => {
    store.bot_event_outbox = [
      {
        id: 'e1',
        tenant_id: TENANT,
        created_at: '2026-08-01T10:00:00.000Z',
        event_name: 'x',
      },
      {
        id: 'e2',
        tenant_id: TENANT,
        created_at: '2026-08-20T10:00:00.000Z',
        event_name: 'x',
      },
      {
        id: 'e3',
        tenant_id: OTHER,
        created_at: '2026-09-01T10:00:00.000Z',
        event_name: 'x',
      },
    ] as any;

    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).lifeSigns.botEvent).toBe(
      '2026-08-20T10:00:00.000Z'
    );
  });

  it('un espace sans rien rend des zéros et des « jamais », pas des erreurs', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const body = res.body as any;
    expect(body.volumes.teams).toBe(0);
    expect(body.volumes.matches).toBe(0);
    expect(body.lifeSigns.matchPlayed).toBeNull();
    expect(body.lifeSigns.apiCall).toBeNull();
  });

  it('rend les manques avec les règles du hub d’onboarding', async () => {
    // Ni serveur, ni staff, ni compte d'envoi : trois manques, dans l'ordre.
    store.discord_guilds = [] as any;
    store.tenant_staff = [] as any;
    store.integration_secrets = [] as any;
    // Le staff reste owner GLOBAL, donc l'accès à la fiche ne dépend pas du
    // rattachement qu'on vient de retirer.

    const res = makeRes();
    await handler(makeReq(), res);
    expect((res.body as any).readiness.blockers).toEqual([
      'aucun_serveur',
      'personne_rattache',
      'emails_non_configures',
    ]);
  });

  it('dit quand le plan appliqué n’est pas le plan facturé', async () => {
    (store.tenants as any[])[0].plan = 'circuit';
    (store.tenants as any[])[0].plan_status = 'past_due';

    const res = makeRes();
    await handler(makeReq(), res);
    const plan = (res.body as any).plan;
    expect(plan.plan).toBe('circuit');
    // past_due → l'entitlement retombe sur discovery, donc plus de bot.
    expect(plan.effectivePlan).toBe('discovery');
    expect(plan.botEnabled).toBe(false);
  });

  it('refuse un id qui n’est pas un UUID', async () => {
    const res = makeRes();
    await handler(makeReq({ query: { id: 'pouet' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('404 sur un espace inexistant', async () => {
    const res = makeRes();
    await handler(
      makeReq({ query: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('405 sur autre chose qu’un GET', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
