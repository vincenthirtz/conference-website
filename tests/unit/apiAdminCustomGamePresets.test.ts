// Tests for /api/admin/custom-game-presets (index + [presetId]).
//
// Presets de partie personnalisée : code d'import du jeu, distribué à l'hôte du
// match (aucun titre n'expose d'API pour créer/lancer un lobby). Un seul preset
// par périmètre — c'est ce qui rend la résolution déterministe côté bot.
//
// Couvert :
//   - list : scope tenant, filtre ?game, filtre ?tournament_id (+ repli tenant)
//   - create : normalisation/validation du code, scope stage⇒tournament,
//     appartenance tenant du tournoi/phase, 409 sur doublon de périmètre
//   - patch : champs éditables, code revalidé, périmètre NON modifiable
//   - delete : 404 hors tenant
//   - le code d'import n'est jamais écrit dans le payload de staff_logs

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import indexHandler from '../../pages/api/admin/custom-game-presets/index';
import itemHandler from '../../pages/api/admin/custom-game-presets/[presetId]';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';

const TOURN = '22222222-2222-4222-8222-22222222aaaa';
const TOURN_FOREIGN = '22222222-2222-4222-8222-22222222ffff';
const STAGE = '33333333-3333-4333-8333-33333333aaaa';
const PRESET_TENANT = '44444444-4444-4444-4444-44444444aaaa';
const PRESET_TOURN = '44444444-4444-4444-4444-44444444bbbb';
const PRESET_FOREIGN = '44444444-4444-4444-4444-44444444ffff';

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
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seed() {
  store.tournaments = [
    { id: TOURN, tenant_id: TENANT, game: 'overwatch', name: 'OWWC' },
    {
      id: TOURN_FOREIGN,
      tenant_id: OTHER_TENANT,
      game: 'overwatch',
      name: 'Foreign',
    },
  ] as any;

  store.tournament_stages = [
    { id: STAGE, tenant_id: TENANT, tournament_id: TOURN, name: 'Finale' },
  ] as any;

  store.custom_game_presets = [
    {
      id: PRESET_TENANT,
      tenant_id: TENANT,
      game: 'overwatch',
      tournament_id: null,
      stage_id: null,
      name: 'Défaut maison',
      import_code: 'TENAN1',
      description: null,
      map_pool: [],
      enabled: true,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: PRESET_TOURN,
      tenant_id: TENANT,
      game: 'overwatch',
      tournament_id: TOURN,
      stage_id: null,
      name: 'OWWC groupes',
      import_code: 'TOURN1',
      description: null,
      map_pool: [],
      enabled: true,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: PRESET_FOREIGN,
      tenant_id: OTHER_TENANT,
      game: 'overwatch',
      tournament_id: null,
      stage_id: null,
      name: 'Autre tenant',
      import_code: 'FOREI1',
      description: null,
      map_pool: [],
      enabled: true,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    },
  ] as any;

  store.staff_logs = [] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow('admin')] as any;
  seed();
});

describe('GET /api/admin/custom-game-presets', () => {
  it('liste les presets du tenant actif uniquement', async () => {
    const res = makeRes();
    await indexHandler(makeAuthedReq({ query: {} }), res);
    expect(res.statusCode).toBe(200);
    const ids = (res.body as any).presets.map((p: any) => p.id);
    expect(ids).toContain(PRESET_TENANT);
    expect(ids).toContain(PRESET_TOURN);
    expect(ids).not.toContain(PRESET_FOREIGN);
  });

  it('trie du plus général au plus spécifique', async () => {
    const res = makeRes();
    await indexHandler(makeAuthedReq({ query: {} }), res);
    const ids = (res.body as any).presets.map((p: any) => p.id);
    expect(ids.indexOf(PRESET_TENANT)).toBeLessThan(ids.indexOf(PRESET_TOURN));
  });

  it('?game filtre par jeu', async () => {
    const res = makeRes();
    await indexHandler(makeAuthedReq({ query: { game: 'valorant' } }), res);
    expect((res.body as any).presets).toEqual([]);
  });

  it('400 sur un game slug inconnu', async () => {
    const res = makeRes();
    await indexHandler(makeAuthedReq({ query: { game: 'quake' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('?tournament_id garde le périmètre tournoi ET son repli tenant', async () => {
    const res = makeRes();
    await indexHandler(makeAuthedReq({ query: { tournament_id: TOURN } }), res);
    const ids = (res.body as any).presets.map((p: any) => p.id);
    expect(ids).toEqual([PRESET_TENANT, PRESET_TOURN]);
  });
});

describe('POST /api/admin/custom-game-presets', () => {
  async function create(body: Record<string, unknown>) {
    const res = makeRes();
    await indexHandler(makeAuthedReq({ method: 'POST', body }), res);
    return res;
  }

  it('crée un preset de phase et normalise le code d’import', async () => {
    const res = await create({
      game: 'overwatch',
      tournament_id: TOURN,
      stage_id: STAGE,
      name: 'Finale Bo5',
      import_code: '  a1b-2c ',
      map_pool: ['Ilios', 'ilios', 'Busan'],
    });
    expect(res.statusCode).toBe(201);
    const preset = (res.body as any).preset;
    expect(preset.import_code).toBe('A1B2C');
    // map_pool dédupliqué insensible à la casse.
    expect(preset.map_pool).toEqual(['Ilios', 'Busan']);
    expect(preset.stage_id).toBe(STAGE);
  });

  it('400 sur un code d’import invalide', async () => {
    const res = await create({
      name: 'Trop court',
      import_code: 'AB1',
    });
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_IMPORT_CODE');
  });

  it('400 si stage_id est fourni sans tournament_id', async () => {
    const res = await create({
      stage_id: STAGE,
      name: 'Orpheline',
      import_code: 'ABC123',
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 si le tournoi appartient à un autre tenant', async () => {
    const res = await create({
      tournament_id: TOURN_FOREIGN,
      name: 'Cross-tenant',
      import_code: 'ABC123',
    });
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('UNKNOWN_TOURNAMENT');
  });

  it('409 si un preset existe déjà sur le même périmètre', async () => {
    const res = await create({
      tournament_id: TOURN,
      name: 'Doublon tournoi',
      import_code: 'ABC123',
    });
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('DUPLICATE_PRESET_SCOPE');
  });

  it('n’écrit jamais le code d’import dans le log staff', async () => {
    await create({
      tournament_id: TOURN,
      stage_id: STAGE,
      name: 'Finale',
      import_code: 'SECRET1',
    });
    const logged = JSON.stringify(store.staff_logs);
    expect(logged).not.toContain('SECRET1');
    expect(logged).toContain('create_custom_game_preset');
  });
});

describe('PATCH/DELETE /api/admin/custom-game-presets/[presetId]', () => {
  async function patch(presetId: string, body: Record<string, unknown>) {
    const res = makeRes();
    await itemHandler(
      makeAuthedReq({ method: 'PATCH', query: { presetId }, body }),
      res
    );
    return res;
  }

  it('met à jour nom / description / enabled', async () => {
    const res = await patch(PRESET_TOURN, {
      name: 'OWWC groupes v2',
      enabled: false,
    });
    expect(res.statusCode).toBe(200);
    expect((res.body as any).preset).toMatchObject({
      name: 'OWWC groupes v2',
      enabled: false,
    });
  });

  it('revalide le code d’import et le normalise', async () => {
    const ok = await patch(PRESET_TOURN, { import_code: 'zz-99 aa' });
    expect(ok.statusCode).toBe(200);
    expect((ok.body as any).preset.import_code).toBe('ZZ99AA');

    const ko = await patch(PRESET_TOURN, { import_code: '!!' });
    expect(ko.statusCode).toBe(400);
  });

  it('ignore toute tentative de changer le périmètre', async () => {
    const res = await patch(PRESET_TENANT, {
      name: 'Toujours tenant',
      tournament_id: TOURN,
      stage_id: STAGE,
      game: 'valorant',
    } as any);
    expect(res.statusCode).toBe(200);
    const preset = (res.body as any).preset;
    expect(preset.tournament_id).toBeNull();
    expect(preset.stage_id).toBeNull();
    expect(preset.game).toBe('overwatch');
  });

  it('400 si le body ne contient aucun champ éditable', async () => {
    const res = await patch(PRESET_TENANT, {});
    expect(res.statusCode).toBe(400);
  });

  it('404 sur un preset d’un autre tenant', async () => {
    const res = await patch(PRESET_FOREIGN, { name: 'Nope' });
    expect(res.statusCode).toBe(404);
  });

  it('supprime un preset du tenant actif', async () => {
    const res = makeRes();
    await itemHandler(
      makeAuthedReq({ method: 'DELETE', query: { presetId: PRESET_TOURN } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
    const ids = (store.custom_game_presets as any[]).map((p) => p.id);
    expect(ids).not.toContain(PRESET_TOURN);
  });

  it('404 en suppression sur un preset d’un autre tenant', async () => {
    const res = makeRes();
    await itemHandler(
      makeAuthedReq({ method: 'DELETE', query: { presetId: PRESET_FOREIGN } }),
      res
    );
    expect(res.statusCode).toBe(404);
    const ids = (store.custom_game_presets as any[]).map((p) => p.id);
    expect(ids).toContain(PRESET_FOREIGN);
  });
});
