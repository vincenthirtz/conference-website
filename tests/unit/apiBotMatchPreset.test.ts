// Tests for GET /api/bot/v1/matches/[matchId]/preset.
//
// Le preset de partie personnalisée est le SEUL levier automatisable côté jeu
// (aucun titre n'expose d'API pour créer/lancer un lobby) : cet endpoint résout
// le périmètre côté site — phase > tournoi > défaut tenant — pour que le bot
// n'ait aucune règle à dupliquer.
//
// Couvert :
//   - auth (401 sans x-api-key), 404 hors tenant, 405 sur POST
//   - résolution par périmètre (phase gagne, puis tournoi, puis tenant)
//   - un preset de phase ne fuit pas sur une phase voisine
//   - preset désactivé ignoré ; jeu du tournoi respecté (scrim → overwatch)
//   - `preset: null` + `lines: []` = cas nominal, pas une erreur
//   - `lines` porte la mise en forme prête à poster (code + cartes)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import presetHandler from '../../pages/api/bot/v1/matches/[matchId]/preset';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = '00000000-0000-4000-8000-000000000999';

const MATCH_STAGE_A = '11111111-1111-4111-8111-111111111111';
const MATCH_STAGE_B = '11111111-1111-4111-8111-111111111112';
const MATCH_OTHER_TOURN = '11111111-1111-4111-8111-111111111113';
const MATCH_SCRIM = '11111111-1111-4111-8111-111111111114';
const MATCH_VALORANT = '11111111-1111-4111-8111-111111111115';
const MATCH_FOREIGN = '11111111-1111-4111-8111-1111111111ff';

const TOURN = '22222222-2222-4222-8222-22222222aaaa';
const TOURN_OTHER = '22222222-2222-4222-8222-22222222bbbb';
const TOURN_VALORANT = '22222222-2222-4222-8222-22222222cccc';
const STAGE_A = '33333333-3333-4333-8333-33333333aaaa';
const STAGE_B = '33333333-3333-4333-8333-33333333bbbb';

function makeBotReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': TENANT,
    },
    query: {},
    body: {},
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

async function call(matchId: string, over: Partial<any> = {}) {
  const res = makeRes();
  await presetHandler(makeBotReq({ query: { matchId }, ...over }), res);
  return res;
}

function seed() {
  store.tenants = [
    {
      id: TENANT,
      plan: 'foundation',
      plan_status: 'active',
      plan_expires_at: null,
    },
  ] as any;

  store.tournaments = [
    { id: TOURN, tenant_id: TENANT, game: 'overwatch' },
    { id: TOURN_OTHER, tenant_id: TENANT, game: 'overwatch' },
    { id: TOURN_VALORANT, tenant_id: TENANT, game: 'valorant' },
  ] as any;

  store.matches = [
    {
      id: MATCH_STAGE_A,
      tenant_id: TENANT,
      tournament_id: TOURN,
      stage_id: STAGE_A,
    },
    {
      id: MATCH_STAGE_B,
      tenant_id: TENANT,
      tournament_id: TOURN,
      stage_id: STAGE_B,
    },
    {
      id: MATCH_OTHER_TOURN,
      tenant_id: TENANT,
      tournament_id: TOURN_OTHER,
      stage_id: null,
    },
    // Scrim : pas de tournoi → jeu par défaut overwatch.
    {
      id: MATCH_SCRIM,
      tenant_id: TENANT,
      tournament_id: null,
      stage_id: null,
    },
    {
      id: MATCH_VALORANT,
      tenant_id: TENANT,
      tournament_id: TOURN_VALORANT,
      stage_id: null,
    },
    {
      id: MATCH_FOREIGN,
      tenant_id: OTHER_TENANT,
      tournament_id: null,
      stage_id: null,
    },
  ] as any;

  store.custom_game_presets = [
    {
      id: 'preset-tenant',
      tenant_id: TENANT,
      game: 'overwatch',
      tournament_id: null,
      stage_id: null,
      name: 'Défaut maison',
      import_code: 'TENAN1',
      description: null,
      map_pool: [],
      enabled: true,
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'preset-tournament',
      tenant_id: TENANT,
      game: 'overwatch',
      tournament_id: TOURN,
      stage_id: null,
      name: 'OWWC groupes',
      import_code: 'TOURN1',
      description: null,
      map_pool: [],
      enabled: true,
      updated_at: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'preset-stage',
      tenant_id: TENANT,
      game: 'overwatch',
      tournament_id: TOURN,
      stage_id: STAGE_A,
      name: 'OWWC finale Bo5',
      import_code: 'STAGE1',
      description: 'Héros interdits : aucun',
      map_pool: ['Ilios', 'Busan'],
      enabled: true,
      updated_at: '2026-07-01T00:00:00.000Z',
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seedBotAuth();
  seed();
});

describe('GET /api/bot/v1/matches/[matchId]/preset', () => {
  it('401 sans x-api-key', async () => {
    const res = await call(MATCH_STAGE_A, { headers: { host: 'h' } });
    expect(res.statusCode).toBe(401);
  });

  it('405 sur une méthode non autorisée', async () => {
    const res = await call(MATCH_STAGE_A, { method: 'POST' });
    expect(res.statusCode).toBe(405);
  });

  it('400 si matchId n’est pas un UUID', async () => {
    const res = await call('pas-un-uuid');
    expect(res.statusCode).toBe(400);
  });

  it('404 pour un match d’un autre tenant', async () => {
    const res = await call(MATCH_FOREIGN);
    expect(res.statusCode).toBe(404);
  });

  it('prend le preset de PHASE quand la phase correspond', async () => {
    const res = await call(MATCH_STAGE_A);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).preset).toMatchObject({
      id: 'preset-stage',
      importCode: 'STAGE1',
      scope: 'stage',
    });
  });

  it('retombe sur le preset du TOURNOI pour une autre phase', async () => {
    const res = await call(MATCH_STAGE_B);
    expect((res.body as any).preset).toMatchObject({
      id: 'preset-tournament',
      importCode: 'TOURN1',
      scope: 'tournament',
    });
  });

  it('retombe sur le défaut TENANT pour un autre tournoi', async () => {
    const res = await call(MATCH_OTHER_TOURN);
    expect((res.body as any).preset).toMatchObject({
      id: 'preset-tenant',
      scope: 'tenant',
    });
  });

  it('un scrim (sans tournoi) résout en overwatch sur le défaut tenant', async () => {
    const res = await call(MATCH_SCRIM);
    expect((res.body as any).game).toBe('overwatch');
    expect((res.body as any).preset?.id).toBe('preset-tenant');
  });

  it('respecte le jeu du tournoi : aucun preset valorant → null', async () => {
    const res = await call(MATCH_VALORANT);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).game).toBe('valorant');
    expect((res.body as any).preset).toBeNull();
    expect((res.body as any).lines).toEqual([]);
  });

  it('ignore un preset désactivé et retombe au rang inférieur', async () => {
    (store.custom_game_presets as any[])[2].enabled = false;
    const res = await call(MATCH_STAGE_A);
    expect((res.body as any).preset?.id).toBe('preset-tournament');
  });

  it('aucun preset configuré → preset null + lines vides (cas nominal)', async () => {
    store.custom_game_presets = [] as any;
    const res = await call(MATCH_STAGE_A);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).preset).toBeNull();
    expect((res.body as any).lines).toEqual([]);
  });

  it('lines porte le bloc prêt à poster (code + cartes)', async () => {
    const res = await call(MATCH_STAGE_A);
    const text = ((res.body as any).lines as string[]).join('\n');
    expect(text).toContain('`STAGE1`');
    expect(text).toContain('OWWC finale Bo5');
    expect(text).toContain('Ilios · Busan');
  });

  it('renvoie le contexte du match (tournamentId / stageId)', async () => {
    const res = await call(MATCH_STAGE_A);
    expect(res.body).toMatchObject({
      matchId: MATCH_STAGE_A,
      tournamentId: TOURN,
      stageId: STAGE_A,
    });
  });
});
