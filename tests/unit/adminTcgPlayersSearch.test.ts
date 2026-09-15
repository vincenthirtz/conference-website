// Unit tests — GET /api/admin/tcg/players (recherche de comptes du TCG).
//
// POURQUOI CETTE ROUTE EXISTE : la carte « Ajuster un solde » cherchait par
// `/api/admin/users/search`, gardée par `manage_staff`. Un staff qui corrige un
// solde (`manage_tcg`) devait donc coller un uuid. Ces cas protègent :
//   1. LE DROIT : `manage_tcg` suffit, un rôle sans ce droit est refusé ;
//   2. LA FORME : celle que lit le sélecteur, bornée à 20 résultats ;
//   3. UNE ERREUR N'EST PAS UNE ABSENCE : RPC en échec → 500, pas `[]`.
//   4. L'ESPACE, ET RIEN QUE L'ESPACE (audit du 2026-09-15). La route appelait
//      la RPC GLOBALE `admin_search_users` : tout owner d'espace — y compris un
//      espace développeur ouvert en libre-service — lisait email, BattleTag et
//      équipe de TOUS les comptes. Elle appelle désormais
//      `admin_search_tcg_players(p_tenant_id, p_query)`, qui filtre EN BASE.
//      Le mock n'exécute pas le SQL : on vérifie ici que la route transmet LE
//      tenant du staff et ne rend jamais l'email ; le filtre SQL lui-même est
//      vérifié par lecture de la migration (`tcgWalletAtomicSql.test.ts`).

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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_ATTACHING_WALLET_SOURCES } from '../../utils/tcg/tenantAttachment';

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

const OTHER_TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function seedStaff(
  role: 'admin' | 'caster' | 'owner',
  extra: string[] = [],
  tenantId: string = DEFAULT_TENANT_ID
) {
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
      tenant_id: tenantId,
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
    setRpcResult('admin_search_tcg_players', {
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
        // JAMAIS rendu, même si la fonction SQL le renvoyait.
        email: null,
        display_name: 'Nova',
        battle_tag: 'Nova#1234',
        team_name: 'Peps',
      },
    ]);
    expect(rpcCalls.at(-1)).toEqual({
      fn: 'admin_search_tcg_players',
      params: { p_tenant_id: DEFAULT_TENANT_ID, p_query: 'nova' },
    });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('ouvre la recherche à un caster qui a reçu `manage_tcg`, sans `manage_staff`', async () => {
    seedStaff('caster', ['manage_tcg']);
    setRpcResult('admin_search_tcg_players', { data: [] });
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
    setRpcResult('admin_search_tcg_players', {
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

  it('SCÉNARIO D’ATTAQUE : un owner d’un AUTRE espace ne cherche que dans le sien, et n’appelle jamais la RPC globale', async () => {
    // AVANT : `admin_search_users(p_query)`, sans tenant → toute la plateforme.
    seedStaff('owner', [], OTHER_TENANT);
    setRpcResult('admin_search_tcg_players', { data: [] });
    // Si la route retombait sur la RPC globale, elle trouverait quelqu'un.
    setRpcResult('admin_search_users', {
      data: [{ id: NOVA, email: 'nova@example.test', display_name: 'Nova' }],
    });

    const res = await call({ q: 'nova', tenant: DEFAULT_TENANT_ID });

    expect(res.statusCode).toBe(200);
    expect(res.body.players).toEqual([]);
    expect(rpcCalls.map((c) => c.fn)).not.toContain('admin_search_users');
    expect(rpcCalls.at(-1)?.params).toMatchObject({
      p_tenant_id: OTHER_TENANT,
    });
  });

  it('migration absente : 503 SEARCH_UNAVAILABLE, sans repli sur la RPC globale', async () => {
    seedStaff('admin');
    setRpcResult('admin_search_tcg_players', {
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('SEARCH_UNAVAILABLE');
    expect(rpcCalls.map((c) => c.fn)).toEqual(['admin_search_tcg_players']);
  });

  it('la fonction SQL filtre par tenant, n’expose pas l’email et partage la liste des gains réels', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'database/migrations/tcg_admin_search_players_scoped.sql'
      ),
      'utf8'
    );
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    // Le tenant est un PARAMÈTRE et chaque source de candidats le filtre.
    expect(body).toMatch(
      /admin_search_tcg_players\(\s*p_tenant_id uuid,\s*p_query text\s*\)/
    );
    expect(body).toMatch(/tm\.tenant_id = p_tenant_id/);
    expect(body).toMatch(/e\.tenant_id = p_tenant_id/);
    // Pas d'email en sortie ni en critère.
    const returns = body.slice(
      body.indexOf('RETURNS TABLE'),
      body.indexOf('LANGUAGE')
    );
    expect(returns).not.toMatch(/email/);
    expect(body).not.toMatch(/u\.email/);
    // `admin_grant` n'ouvre pas le rattachement : la liste SQL est EXACTEMENT
    // celle de `utils/tcg/tenantAttachment.ts`.
    const listMatch = body.match(/source_kind IN \(([^)]*)\)/);
    expect(listMatch).not.toBeNull();
    const sqlSources = (listMatch as RegExpMatchArray)[1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();
    expect(sqlSources).toEqual([...TENANT_ATTACHING_WALLET_SOURCES].sort());
    expect(sqlSources).not.toContain('admin_grant');
    // EXECUTE réservé au service_role.
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_search_tcg_players\(uuid, text\) FROM PUBLIC/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_search_tcg_players\(uuid, text\) TO service_role/
    );
  });

  it('une recherche EN ÉCHEC rend 500, jamais une liste vide', async () => {
    seedStaff('admin');
    setRpcResult('admin_search_tcg_players', { error: { message: 'boom' } });
    const res = await call();
    expect(res.statusCode).toBe(500);
  });
});
