// Unit tests — GET /api/admin/tcg/players (recherche de comptes du TCG).
//
// POURQUOI CETTE ROUTE EXISTE : la carte « Ajuster un solde » cherchait par
// `/api/admin/users/search`, gardée par `manage_staff`. Un staff qui corrige un
// solde (`manage_tcg`) devait donc coller un uuid. Ces cas protègent :
//   1. LE DROIT : `manage_tcg` suffit, un rôle sans ce droit est refusé ;
//   2. LA FORME : celle que lit le sélecteur, bornée à 20 résultats ;
//   3. UNE ERREUR N'EST PAS UNE ABSENCE : RPC en échec → 500, pas `[]`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
  rpcCalls,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import handler from '../../pages/api/admin/tcg/players';

const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';
const NOVA = '11111111-1111-4111-8111-111111111111';

let _n = 0;
function makeReq(query: Record<string, unknown> = { q: 'nova' }): any {
  _n += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_n}`,
      'x-real-ip': `10.2.0.${_n % 250}`,
    },
    cookies: {},
    query,
    body: {},
  };
}

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

function seedStaff(role: 'admin' | 'caster', extra: string[] = []) {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.test',
      display_name: 'Staff',
      role,
      extra_permissions: extra,
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    {
      tenant_id: DEFAULT_TENANT_ID,
      staff_id: STAFF_ROW,
      role,
      created_at: '2026-01-01',
    },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

async function call(query?: Record<string, unknown>) {
  const res = makeRes();
  await handler(makeReq(query), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('GET /api/admin/tcg/players', () => {
  it('rend les comptes trouvés, dans la forme du sélecteur', async () => {
    seedStaff('admin');
    setRpcResult('admin_search_users', {
      data: [
        {
          id: NOVA,
          email: 'nova@example.test',
          display_name: 'Nova',
          battle_tag: 'Nova#1234',
          team_id: 'x',
          team_name: 'Peps',
        },
      ],
    });

    const res = await call({ q: '  nova ' });

    expect(res.statusCode).toBe(200);
    expect(res.body.players).toEqual([
      {
        id: NOVA,
        email: 'nova@example.test',
        display_name: 'Nova',
        battle_tag: 'Nova#1234',
        team_name: 'Peps',
      },
    ]);
    expect(rpcCalls.at(-1)).toMatchObject({
      fn: 'admin_search_users',
      params: { p_query: 'nova' },
    });
  });

  it('ouvre la recherche à un caster qui a reçu `manage_tcg`, sans `manage_staff`', async () => {
    seedStaff('caster', ['manage_tcg']);
    setRpcResult('admin_search_users', { data: [] });
    const res = await call();
    expect(res.statusCode).toBe(200);
  });

  it('403 pour un caster sans `manage_tcg` (le support seul ne suffit pas)', async () => {
    seedStaff('caster', ['moderate_support']);
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it('400 sous 2 caractères, sans interroger la base', async () => {
    seedStaff('admin');
    const res = await call({ q: 'n' });
    expect(res.statusCode).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('borne la liste à 20 résultats', async () => {
    seedStaff('admin');
    setRpcResult('admin_search_users', {
      data: Array.from({ length: 30 }, (_, i) => ({
        id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
        email: null,
        display_name: `J${i}`,
        battle_tag: null,
        team_name: null,
      })),
    });
    const res = await call();
    expect(res.body.players).toHaveLength(20);
  });

  it('une recherche EN ÉCHEC rend 500, jamais une liste vide', async () => {
    seedStaff('admin');
    setRpcResult('admin_search_users', { error: { message: 'boom' } });
    const res = await call();
    expect(res.statusCode).toBe(500);
  });
});
