// tests/unit/apiBotValidation.test.ts
//
// Tests de COMPORTEMENT de la nouvelle couche de validation zod sur les routes
// Discord-bot (`withBotRoute(handler, { bodySchema, querySchema })`).
//
// On ne re-teste pas la logique métier des handlers (couverte ailleurs) — on
// vérifie uniquement que :
//   - un body invalide → 400 { code:'INVALID_BODY', fields:{...} }
//   - une query/param invalide → 400 { code:'INVALID_QUERY', fields:{...} }
//   - un input valide PASSE la couche de validation (le handler s'exécute :
//     il peut ensuite répondre 404/403 sur l'état du store, ce qui prouve que
//     la validation ne l'a PAS court-circuité avec un 400).
//
// Représentatif : une ou deux routes par famille (report, checkin, forfeit,
// register-user, clone, events/ack crossTenant, scrims). PAS les 33.
//
// Harness : mock supabase in-memory + bypass rateLimit (cf.
// tests/unit/__helpers__/testSetup.ts). Auth bot via BOT_API_KEY env +
// x-tenant-id header pointant sur un tenant seedé (withBotRoute vérifie son
// existence). Les routes crossTenant ignorent le header.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import { __resetBotIdempotencyCache } from '../../utils/botAuth';
import { __resetMaintenanceCache } from '../../utils/maintenance';

import reportHandler from '../../pages/api/bot/v1/matches/[matchId]/report';
import checkinHandler from '../../pages/api/bot/v1/matches/[matchId]/checkin';
import forfeitHandler from '../../pages/api/bot/v1/matches/[matchId]/forfeit';
import registerUserHandler from '../../pages/api/bot/v1/register-user';
import cloneHandler from '../../pages/api/bot/v1/tournaments/[tournamentId]/clone';
import ackHandler from '../../pages/api/bot/v1/events/[id]/ack';
import scrimsHandler from '../../pages/api/bot/v1/scrims/index';

// Conference tenant UUID — match DEFAULT_TENANT_ID in utils/tenant.ts.
const TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440b01';
const VALID_UUID_2 = '550e8400-e29b-41d4-a716-446655440b02';
const VALID_DISCORD = '900000000000000001';

type AnyReq = Record<string, unknown>;

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

// DRY scaffold : POST avec auth bot valide + tenant seedé. `over` écrase
// method/query/body/headers selon le cas testé.
function makeReq(over: Partial<AnyReq> = {}): any {
  return {
    method: 'POST',
    headers: {
      host: 'h',
      'x-api-key': 'test-key',
      'x-tenant-id': TENANT_ID,
      ...((over.headers as Record<string, unknown>) ?? {}),
    },
    query: {},
    body: {},
    ...over,
    // ré-applique headers après le spread `over` pour ne pas perdre l'auth
    // quand `over` fournit un sous-ensemble de headers.
    ...(over.headers
      ? {
          headers: {
            host: 'h',
            'x-api-key': 'test-key',
            'x-tenant-id': TENANT_ID,
            ...(over.headers as Record<string, unknown>),
          },
        }
      : {}),
  };
}

beforeEach(() => {
  resetSupabaseMock();
  __resetMaintenanceCache();
  // Per-tenant bot auth : seed tenant_secrets so x-api-key 'test-key' resolves
  // to the conference tenant (TENANT_ID). Also seeds the matching tenants row.
  seedBotAuth({ tenantId: TENANT_ID });
  store.site_settings = [
    { key: 'bot_maintenance_mode', value: 'false' },
  ] as any;
});

afterEach(async () => {
  await __resetBotIdempotencyCache();
});

// Helper d'assertion : un 400 de la couche validation a bien la forme attendue.
function expectInvalidBody(res: any) {
  expect(res.statusCode).toBe(400);
  expect(res.body.code).toBe('INVALID_BODY');
  expect(res.body.fields).toBeDefined();
  expect(typeof res.body.fields).toBe('object');
}
function expectInvalidQuery(res: any) {
  expect(res.statusCode).toBe(400);
  expect(res.body.code).toBe('INVALID_QUERY');
  expect(res.body.fields).toBeDefined();
}

describe('bot validation — matches/[matchId]/report', () => {
  const base = () =>
    makeReq({
      query: { matchId: VALID_UUID },
      body: {
        discordUserId: VALID_DISCORD,
        team1Score: 2,
        team2Score: 1,
      },
    });

  it('400 INVALID_BODY when team1Score out of 0-99 range', async () => {
    const res = makeRes();
    const req = base();
    req.body.team1Score = 150;
    await reportHandler(req, res);
    expectInvalidBody(res);
    expect(res.body.fields.team1Score).toBeDefined();
  });

  it('400 INVALID_BODY when discordUserId missing', async () => {
    const res = makeRes();
    const req = base();
    delete req.body.discordUserId;
    await reportHandler(req, res);
    expectInvalidBody(res);
    expect(res.body.fields.discordUserId).toBeDefined();
  });

  it('400 INVALID_BODY when score is non-numeric (string)', async () => {
    const res = makeRes();
    const req = base();
    req.body.team2Score = '3';
    await reportHandler(req, res);
    expectInvalidBody(res);
    expect(res.body.fields.team2Score).toBeDefined();
  });

  it('400 INVALID_QUERY when matchId path param is not a uuid', async () => {
    const res = makeRes();
    const req = base();
    req.query.matchId = 'not-a-uuid';
    await reportHandler(req, res);
    expectInvalidQuery(res);
    expect(res.body.fields.matchId).toBeDefined();
  });

  it('passes validation on good input (handler runs → 404 on empty store, not 400)', async () => {
    const res = makeRes();
    await reportHandler(base(), res);
    // Pas de match seedé → le handler répond 404 « Match introuvable ».
    // L'important : ce n'est PAS un 400 de validation.
    expect(res.statusCode).toBe(404);
    expect(res.body.code).not.toBe('INVALID_BODY');
  });
});

describe('bot validation — matches/[matchId]/checkin', () => {
  it('400 INVALID_BODY when discordUserId too short', async () => {
    const res = makeRes();
    await checkinHandler(
      makeReq({
        query: { matchId: VALID_UUID },
        body: { discordUserId: '123' },
      }),
      res
    );
    expectInvalidBody(res);
    expect(res.body.fields.discordUserId).toBeDefined();
  });

  it('passes validation on good input (→ 404 on empty store)', async () => {
    const res = makeRes();
    await checkinHandler(
      makeReq({
        query: { matchId: VALID_UUID },
        body: { discordUserId: VALID_DISCORD },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('bot validation — matches/[matchId]/forfeit', () => {
  it('400 INVALID_BODY when forfeitTeamId is not a uuid', async () => {
    const res = makeRes();
    await forfeitHandler(
      makeReq({
        query: { matchId: VALID_UUID },
        body: {
          actorDiscordUserId: VALID_DISCORD,
          forfeitTeamId: 'nope',
        },
      }),
      res
    );
    expectInvalidBody(res);
    expect(res.body.fields.forfeitTeamId).toBeDefined();
  });

  it('400 INVALID_QUERY when matchId is not a uuid', async () => {
    const res = makeRes();
    await forfeitHandler(
      makeReq({
        query: { matchId: '123' },
        body: {
          actorDiscordUserId: VALID_DISCORD,
          forfeitTeamId: VALID_UUID_2,
        },
      }),
      res
    );
    expectInvalidQuery(res);
    expect(res.body.fields.matchId).toBeDefined();
  });

  it('passes validation on good input (→ 403 non-staff actor, not 400)', async () => {
    const res = makeRes();
    await forfeitHandler(
      makeReq({
        query: { matchId: VALID_UUID },
        body: {
          actorDiscordUserId: VALID_DISCORD,
          forfeitTeamId: VALID_UUID_2,
        },
      }),
      res
    );
    // Acteur non lié à un staff admin/owner → requireBotStaff répond 403.
    // Prouve que la validation body/query a laissé passer la requête.
    expect(res.statusCode).toBe(403);
  });
});

describe('bot validation — register-user', () => {
  const base = () =>
    makeReq({
      body: {
        email: 'newuser@example.com',
        discordUserId: VALID_DISCORD,
      },
    });

  it("400 INVALID_BODY when role='owner' (forbidden, not in enum)", async () => {
    const res = makeRes();
    const req = base();
    req.body.role = 'owner';
    await registerUserHandler(req, res);
    expectInvalidBody(res);
    expect(res.body.fields.role).toBeDefined();
  });

  it('400 INVALID_BODY on invalid email', async () => {
    const res = makeRes();
    const req = base();
    req.body.email = 'not-an-email';
    await registerUserHandler(req, res);
    expectInvalidBody(res);
    expect(res.body.fields.email).toBeDefined();
  });

  it('400 INVALID_BODY when discordUserId missing', async () => {
    const res = makeRes();
    const req = base();
    delete req.body.discordUserId;
    await registerUserHandler(req, res);
    expectInvalidBody(res);
    expect(res.body.fields.discordUserId).toBeDefined();
  });

  it("accepts role='admin' through validation (handler proceeds past 400)", async () => {
    const res = makeRes();
    const req = base();
    req.body.role = 'admin';
    await registerUserHandler(req, res);
    // Le handler poursuit (lookup link, createUser…). Selon le mock il peut
    // répondre 201/409/500, mais surtout PAS un 400 INVALID_BODY.
    expect(res.body?.code).not.toBe('INVALID_BODY');
  });
});

describe('bot validation — tournaments/[tournamentId]/clone', () => {
  it('400 INVALID_BODY when slug has illegal chars', async () => {
    const res = makeRes();
    await cloneHandler(
      makeReq({
        query: { tournamentId: VALID_UUID },
        body: {
          actorDiscordUserId: VALID_DISCORD,
          slug: 'bad slug!!',
        },
      }),
      res
    );
    expectInvalidBody(res);
    expect(res.body.fields.slug).toBeDefined();
  });

  it('400 INVALID_QUERY when tournamentId is not a uuid', async () => {
    const res = makeRes();
    await cloneHandler(
      makeReq({
        query: { tournamentId: 'xyz' },
        body: { actorDiscordUserId: VALID_DISCORD },
      }),
      res
    );
    expectInvalidQuery(res);
  });

  it('passes validation on good input (→ 403 non-staff actor, not 400)', async () => {
    const res = makeRes();
    await cloneHandler(
      makeReq({
        query: { tournamentId: VALID_UUID },
        body: { actorDiscordUserId: VALID_DISCORD, slug: 'valid-slug' },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});

describe('bot validation — events/[id]/ack (crossTenant)', () => {
  // crossTenant:true → le header x-tenant-id est ignoré ; pas besoin de
  // tenant seedé. La query `id` doit coercer vers un entier positif.
  it('400 INVALID_QUERY when id path is non-integer', async () => {
    const res = makeRes();
    await ackHandler(makeReq({ query: { id: 'abc' } }), res);
    expectInvalidQuery(res);
    expect(res.body.fields.id).toBeDefined();
  });

  it('400 INVALID_QUERY when id is zero / non-positive', async () => {
    const res = makeRes();
    await ackHandler(makeReq({ query: { id: '0' } }), res);
    expectInvalidQuery(res);
  });

  it('passes validation on a positive integer id (→ 404 on empty outbox)', async () => {
    const res = makeRes();
    await ackHandler(makeReq({ query: { id: '42' } }), res);
    expect(res.statusCode).toBe(404);
  });
});

describe('bot validation — scrims (POST create)', () => {
  it('400 INVALID_BODY when team1_id is not a uuid', async () => {
    const res = makeRes();
    await scrimsHandler(
      makeReq({
        body: {
          actorDiscordUserId: VALID_DISCORD,
          name: 'My Scrim',
          team1_id: 'not-a-uuid',
        },
      }),
      res
    );
    expectInvalidBody(res);
    expect(res.body.fields.team1_id).toBeDefined();
  });

  it('400 INVALID_BODY when game slug has illegal chars', async () => {
    const res = makeRes();
    await scrimsHandler(
      makeReq({
        body: {
          actorDiscordUserId: VALID_DISCORD,
          name: 'My Scrim',
          game: 'League Of Legends',
        },
      }),
      res
    );
    expectInvalidBody(res);
    expect(res.body.fields.game).toBeDefined();
  });

  it('passes validation on good input (→ 403 non-staff actor, not 400)', async () => {
    const res = makeRes();
    await scrimsHandler(
      makeReq({
        body: {
          actorDiscordUserId: VALID_DISCORD,
          name: 'My Scrim',
          game: 'lol',
          team1_id: VALID_UUID,
          team2_id: VALID_UUID_2,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });
});
