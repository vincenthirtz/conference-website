// Tests de GET /api/admin/network-funnel — l'entonnoir du réseau
// (lot 10 de docs/BACKLOG-reseau-social.md).
//
// Ce qui est réellement en jeu ici n'est pas « la route répond », c'est la
// distinction `null` / `0` : un comptage en échec doit remonter `null`, jamais
// zéro. Confondre les deux ferait lire une panne de lecture comme un réseau
// vide — exactement la conclusion fausse qu'on cherche à éviter en construisant
// cet écran.
//
// supabase + rateLimit sont mockés par tests/unit/__helpers__/testSetup.ts.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import funnelHandler from '@/pages/api/admin/network-funnel';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const STAFF_ID = '55555555-5555-5555-5555-555555555555';

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t-1' },
    cookies: { staff_active_tenant_id: TENANT },
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });

  store.staff = [
    {
      id: STAFF_ID,
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ];
  store.tenant_staff = [
    { tenant_id: TENANT, staff_id: STAFF_ID, role: 'admin' },
  ];

  setRpcResult('admin_list_users', { data: [{ total_count: 38 }] });
});

async function get() {
  const res = makeRes();
  await funnelHandler(makeReq(), res);
  return res;
}

describe('GET /api/admin/network-funnel', () => {
  it('compte chaque marche, comptes inclus via la RPC', async () => {
    store.user_discord_links = [{ user_id: 'u1' }, { user_id: 'u2' }];
    store.user_battlenet_links = [{ user_id: 'u1' }];
    store.player_discovery_profiles = [
      { auth_user_id: 'u1', discoverable: true },
      { auth_user_id: 'u2', discoverable: false },
    ];
    store.player_follows = [{ follower_id: 'u1', followee_id: 'u2' }];

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      accounts: 38,
      discordLinkedGlobal: 2,
      battlenetLinkedGlobal: 1,
      discoveryProfilesGlobal: 2,
      discoverableGlobal: 1,
      followsGlobal: 1,
    });
  });

  it('distingue « carte créée » de « carte visible »', async () => {
    // Le cœur du constat d'amorçage : des cartes peuvent exister sans que
    // personne ne soit trouvable.
    store.player_discovery_profiles = [
      { auth_user_id: 'u1', discoverable: false },
      { auth_user_id: 'u2', discoverable: false },
    ];

    const res = await get();

    expect(res.body).toMatchObject({
      discoveryProfilesGlobal: 2,
      discoverableGlobal: 0,
    });
  });

  it('rend 0 — et non null — quand une table est réellement vide', async () => {
    const res = await get();

    expect(res.body).toMatchObject({
      discordLinkedGlobal: 0,
      discoverableGlobal: 0,
      followsGlobal: 0,
    });
  });

  it('rend null quand le comptage des comptes échoue, jamais 0', async () => {
    setRpcResult('admin_list_users', { error: { message: 'db down' } });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.body.accounts).toBeNull();
  });

  it('ne met jamais la réponse en cache', async () => {
    const res = await get();

    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('refuse les autres méthodes', async () => {
    const res = makeRes();
    await funnelHandler(makeReq({ method: 'POST' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });
});
