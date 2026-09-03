// tests/unit/apiAdminTenantsReadiness.test.ts
//
// GET /api/admin/tenants/readiness — « qu'est-ce qui manque à chaque espace ? »
//
// Deux choses à verrouiller.
//
// LA PORTÉE. C'est une vue transverse : elle liste TOUS les espaces. Depuis que
// `tenant_staff.role` élève le rôle effectif, le propriétaire d'un espace porte
// `manage_tenant` chez lui — sans la portée `platform`, il lirait l'état de
// tous les autres. C'est exactement la classe de fuite que l'élévation de rôle
// pouvait introduire.
//
// LE DIAGNOSTIC. Un espace peut exister, sembler en règle, et ne rien faire :
// plan sans bot, aucun serveur rattaché, personne pour l'administrer, Discord
// jamais configuré, pas de compte d'envoi. Chacun de ces cas doit ressortir
// nommément, sinon la vue ne sert à rien — et aucun ne doit crier à tort, car
// un critère qui se trompe finit par ne plus être lu.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import handler from '../../pages/api/admin/tenants/readiness';

const PLATFORM_TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TENANT_B = '11111111-2222-4333-8444-555555555555';
const STAFF_ID = 'staff-1';
const GUILD_B = '222222222222222222';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies: {},
    query: {},
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

/**
 * Staff global `role`, éventuellement rattaché à TENANT_B avec `tenantRole`.
 * L'espace historique reçoit toujours un rattachement `admin` — c'est son état
 * réel en base, et le critère « personne rattaché » ne doit pas s'y déclencher.
 */
function seedStaff(role: string, tenantRole: string | null) {
  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role,
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenant_staff = [
    { tenant_id: PLATFORM_TENANT, staff_id: 'staff-hist', role: 'admin' },
    ...(tenantRole
      ? [{ tenant_id: TENANT_B, staff_id: STAFF_ID, role: tenantRole }]
      : []),
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.tenants = [
    {
      id: PLATFORM_TENANT,
      slug: 'conference',
      name: 'Conférence',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
      plan_is_trial: false,
    },
    {
      id: TENANT_B,
      slug: 'cup-estivale',
      name: 'Cup Estivale',
      is_active: true,
      created_at: '2026-09-01T00:00:00.000Z',
      plan: 'regie',
      plan_status: 'active',
      plan_expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      plan_is_trial: true,
    },
  ] as any;
  store.discord_guilds = [
    { tenant_id: PLATFORM_TENANT, guild_id: '111111111111111111' },
    { tenant_id: TENANT_B, guild_id: GUILD_B },
  ] as any;
  store.tenant_discord_config = [
    {
      guild_id: '111111111111111111',
      staff_log_channel_id: '999',
      matches_live_channel_id: '888',
    },
    // Le serveur de B est lié mais rien n'est configuré : c'est l'angle mort
    // que cette vue existe pour montrer.
    { guild_id: GUILD_B },
  ] as any;
  store.tenant_secrets = [{ tenant_id: PLATFORM_TENANT }] as any;
  store.integration_secrets = [
    { tenant_id: PLATFORM_TENANT, key: 'brevo_api_key' },
  ] as any;
});

describe('portée', () => {
  it('refuse un propriétaire d’espace (owner chez lui, pas sur la plateforme)', async () => {
    seedStaff('caster', 'owner');
    const res = makeRes();
    await handler(makeReq(), res);
    // 403 : le rôle effectif l'a élevé sur SON espace, pas sur le hub.
    expect(res.statusCode).toBe(403);
  });

  it('refuse un admin global (le hub d’onboarding est owner-only)', async () => {
    seedStaff('admin', null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(403);
  });

  it('accepte un owner de la plateforme', async () => {
    seedStaff('owner', null);
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('diagnostic', () => {
  beforeEach(() => {
    seedStaff('owner', null);
  });

  it('un espace complet n’a aucun manque (rôles admin compris)', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const conf = (res.body as any).tenants.find(
      (t: any) => t.slug === 'conference'
    );
    expect(conf.blockers).toEqual([]);
    expect(conf.botEnabled).toBe(true);
    expect(conf.hasEmailSender).toBe(true);
  });

  it('nomme ce qui manque, dans l’ordre du plus bloquant', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const b = (res.body as any).tenants.find(
      (t: any) => t.slug === 'cup-estivale'
    );
    // Serveur lié mais vide, personne de rattaché, aucun compte d'envoi.
    expect(b.blockers).toEqual([
      'personne_rattache',
      'discord_non_configure',
      'emails_non_configures',
    ]);
    expect(b.guildCount).toBe(1);
    expect(b.configuredKeys).toBe(0);
    expect(b.hasEmailSender).toBe(false);
  });

  it('signale un essai et son échéance', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const b = (res.body as any).tenants.find(
      (t: any) => t.slug === 'cup-estivale'
    );
    expect(b.isTrial).toBe(true);
    expect(b.daysRemaining).toBeGreaterThan(0);
    expect(b.daysRemaining).toBeLessThanOrEqual(3);
  });

  it('un plan expiré ressort comme « plan sans bot »', async () => {
    (store.tenants as any[])[1].plan_status = 'past_due';
    const res = makeRes();
    await handler(makeReq(), res);
    const b = (res.body as any).tenants.find(
      (t: any) => t.slug === 'cup-estivale'
    );
    // effectivePlan retombe sur `discovery`, qui n'inclut pas le bot.
    expect(b.effectivePlan).toBe('discovery');
    expect(b.botEnabled).toBe(false);
    expect(b.blockers).toContain('plan_sans_bot');
  });

  it('les espaces développeur sont hors de cette vue', async () => {
    (store.tenants as any[]).push({
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'un-dev',
      name: 'Un Dev',
      is_active: true,
      created_at: '2026-09-02T00:00:00.000Z',
      kind: 'developer',
      plan: 'discovery',
      plan_status: 'active',
      plan_expires_at: null,
    });
    const res = makeRes();
    await handler(makeReq(), res);
    const slugs = (res.body as any).tenants.map((t: any) => t.slug);
    // Ils portent des clés d'API, pas un tournoi : les mesurer sur « le bot
    // répond-il ? » n'aurait aucun sens.
    expect(slugs).not.toContain('un-dev');
  });
});
