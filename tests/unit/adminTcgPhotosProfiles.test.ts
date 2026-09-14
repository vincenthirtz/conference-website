// tests/unit/adminTcgPhotosProfiles.test.ts
//
// LA FILE DE MODÉRATION DES PHOTOS AFFICHE QUI A DÉPOSÉ.
//
// Chaque élément de `GET /api/admin/tcg/photos` porte `displayName` et `email`,
// résolus par la RPC `admin_get_user_profiles` (via `fetchAdminUserProfiles`) —
// jamais par une table `profiles`, qui n'existe pas.
//
// L'ENRICHISSEMENT NE DOIT JAMAIS COÛTER LA FILE. Ce qu'une relectrice doit voir
// avant tout, c'est l'image : une RPC en échec rend des noms `null`, pas un 500.
// Le contrat est additif — `userId`, `photoUrl`, `submittedAt` restent là.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  setRpcResult,
  rpcCalls,
  fromCalls,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';

import moderationHandler from '../../pages/api/admin/tcg/photos';

const NOVA = '11111111-1111-4111-8111-111111111111';
const KIRA = '22222222-2222-4222-8222-222222222222';
const GHOST = '33333333-3333-4333-8333-333333333333';
const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';

let _n = 0;
function makeReq(): any {
  _n += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${_n}`,
      'x-real-ip': `10.1.0.${_n % 250}`,
    },
    cookies: {},
    query: {},
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

function seedStaff() {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.com',
      role: 'admin',
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    {
      tenant_id: DEFAULT_TENANT_ID,
      staff_id: STAFF_ROW,
      role: 'admin',
      created_at: '2026-01-01',
    },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

/** Colonnes réelles de `tcg_player_cards` (create_tcg_tables.sql). */
function pending(userId: string, updatedAt: string) {
  return {
    tenant_id: DEFAULT_TENANT_ID,
    user_id: userId,
    opted_in_at: '2026-01-01T00:00:00.000Z',
    revoked_at: null,
    photo_path: `tcg/${userId}.png`,
    photo_status: 'pending',
    photo_reviewed_by: null,
    photo_reviewed_at: null,
    photo_rejected_reason: null,
    updated_at: updatedAt,
  };
}

async function list() {
  const res = makeRes();
  await moderationHandler(makeReq(), res);
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  seedStaff();
  store.tcg_player_cards = [
    pending(NOVA, '2026-09-01T10:00:00.000Z'),
    pending(KIRA, '2026-09-02T10:00:00.000Z'),
    pending(GHOST, '2026-09-03T10:00:00.000Z'),
  ] as any;
  setAuthListUsers([
    {
      id: NOVA,
      email: 'nova@example.com',
      user_metadata: { display_name: 'Nova', full_name: 'Nova Discord' },
    },
    // Compte créé via Discord : pas de `display_name`, seulement `full_name`.
    {
      id: KIRA,
      email: 'kira@example.com',
      user_metadata: { full_name: 'Kira' },
    },
  ] as any);
});

describe('GET /api/admin/tcg/photos — pseudos', () => {
  it('résout displayName et email en UN appel RPC', async () => {
    const res = await list();
    expect(res.statusCode).toBe(200);

    const [nova, kira] = res.body.photos;
    expect(nova).toMatchObject({
      userId: NOVA,
      displayName: 'Nova',
      email: 'nova@example.com',
      submittedAt: '2026-09-01T10:00:00.000Z',
    });
    expect(nova.photoUrl).toContain(`tcg/${NOVA}.png`);
    // Repli `full_name` pour un compte Discord.
    expect(kira).toMatchObject({
      displayName: 'Kira',
      email: 'kira@example.com',
    });

    const calls = rpcCalls.filter((c) => c.fn === 'admin_get_user_profiles');
    expect(calls).toHaveLength(1);
    expect((calls[0].params as any).p_ids).toEqual([NOVA, KIRA, GHOST]);
    // Il n'existe pas de table `profiles` : ne jamais la lire.
    expect(fromCalls).not.toContain('profiles');
  });

  it('un compte introuvable garde sa ligne, avec des noms `null`', async () => {
    const res = await list();
    const ghost = res.body.photos.find((p: any) => p.userId === GHOST);
    expect(ghost).toMatchObject({ displayName: null, email: null });
    expect(ghost.photoUrl).toBeTruthy();
    expect(res.body.total).toBe(3);
  });

  it('une RPC en échec ne fait PAS échouer la file : repli `null`', async () => {
    setRpcResult('admin_get_user_profiles', {
      error: { message: 'statement timeout' },
    });
    const res = await list();
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3);
    for (const photo of res.body.photos) {
      expect(photo.displayName).toBeNull();
      expect(photo.email).toBeNull();
      expect(photo.photoUrl).toBeTruthy();
    }
  });

  it('une exception pendant la résolution ne fait pas échouer la file', async () => {
    const { supabaseAdmin } = await import('./__helpers__/supabaseMock');
    vi.spyOn(supabaseAdmin, 'rpc').mockImplementationOnce(() => {
      throw new Error('socket hang up');
    });
    const res = await list();
    expect(res.statusCode).toBe(200);
    expect(res.body.photos.every((p: any) => p.displayName === null)).toBe(
      true
    );
  });

  it('file vide : aucun appel RPC', async () => {
    store.tcg_player_cards = [];
    const res = await list();
    expect(res.body).toEqual({ photos: [], total: 0 });
    expect(
      rpcCalls.filter((c) => c.fn === 'admin_get_user_profiles')
    ).toHaveLength(0);
  });
});
