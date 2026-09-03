// tests/unit/apiAdminTenantsUsage.test.ts
//
// T3 — la consommation d'API, vue de la plateforme.
//
// Les compteurs existaient et personne ne les lisait à l'échelle de tous les
// espaces : un dépassement s'apprenait par des 429, en pleine journée de
// matchs.
//
// Ce que ces tests tiennent :
//   - le quota comparé est celui du plan EFFECTIF (un plan payant expiré est
//     mesuré contre ce qu'il obtient vraiment, pas contre ce qu'il paie) ;
//   - « illimité » n'est pas « zéro » — les confondre ferait crier un espace
//     qui n'a aucun mur ;
//   - le tri met les plus proches du plafond en tête, seule raison d'ouvrir
//     l'écran.

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
import { monthKey } from '../../utils/billing/apiQuota';
import handler from '../../pages/api/admin/tenants/usage';

const A = CONFERENCE_TENANT_ID;
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let _t = 0;
function req(over: Partial<Record<string, unknown>> = {}): any {
  _t += 1;
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer t-${Date.now()}-${_t}` },
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

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'owner',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
  store.tenants = [
    {
      id: A,
      slug: 'aaa',
      name: 'Alpha',
      plan: 'regie', // quota 100 000
      plan_status: 'active',
      plan_expires_at: null,
    },
    {
      id: B,
      slug: 'bbb',
      name: 'Beta',
      plan: 'foundation', // illimité
      plan_status: 'active',
      plan_expires_at: null,
    },
    {
      id: C,
      slug: 'ccc',
      name: 'Gamma',
      plan: 'circuit', // 500 000, mais expiré
      plan_status: 'past_due',
      plan_expires_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  store.api_usage_counters = [] as any;
});

const key = () => monthKey(new Date());

describe('GET /api/admin/tenants/usage', () => {
  it('mesure contre le quota du plan EFFECTIF', async () => {
    store.api_usage_counters = [
      { tenant_id: C, window_kind: 'month', window_key: key(), count: 10 },
    ] as any;

    const res = makeRes();
    await handler(req(), res);
    const gamma = (res.body as any).rows.find((r: any) => r.slug === 'ccc');
    // circuit past_due → discovery → quota 0, donc pas de mur à mesurer.
    expect(gamma.effectivePlan).toBe('discovery');
    expect(gamma.monthLimit).toBe(0);
  });

  it('distingue « illimité » de « zéro »', async () => {
    const res = makeRes();
    await handler(req(), res);
    const beta = (res.body as any).rows.find((r: any) => r.slug === 'bbb');
    // `null` = pas de plafond. Un `0` dirait l'inverse exact.
    expect(beta.monthLimit).toBeNull();
    expect(beta.percent).toBeNull();
  });

  it('calcule la part consommée et trie les plus proches du mur en tête', async () => {
    store.api_usage_counters = [
      { tenant_id: A, window_kind: 'month', window_key: key(), count: 90_000 },
    ] as any;

    const res = makeRes();
    await handler(req(), res);
    const rows = (res.body as any).rows;
    expect(rows[0].slug).toBe('aaa');
    expect(rows[0].percent).toBe(90);
  });

  it('ignore les compteurs d’une autre fenêtre', async () => {
    store.api_usage_counters = [
      { tenant_id: A, window_kind: 'month', window_key: '190001', count: 999 },
      { tenant_id: A, window_kind: 'minute', window_key: key(), count: 5 },
    ] as any;

    const res = makeRes();
    await handler(req(), res);
    const alpha = (res.body as any).rows.find((r: any) => r.slug === 'aaa');
    expect(alpha.monthUsed).toBe(0);
  });

  it('405 sur autre chose qu’un GET', async () => {
    const res = makeRes();
    await handler(req({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
