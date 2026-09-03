// tests/unit/botAuthPlatformKey.test.ts
//
// Clé « plateforme » : le bot mutualisé agit pour le compte d'un autre tenant.
//
// Le problème réglé ici. Le bot invité par un nouveau tenant est NOTRE process
// (l'URL d'invitation est bâtie sur notre DISCORD_CLIENT_ID) et il ne porte
// qu'une `BOT_API_KEY`. Comme le site résolvait le tenant depuis la clé et
// ignorait l'en-tête, une commande lancée depuis le serveur du tenant B
// s'authentifiait comme le tenant propriétaire de la clé et écrivait chez lui.
//
// Le contrat vérifié :
//   - le guild (`x-guild-id`), vérifié contre `discord_guilds`, tranche — il
//     est le seul signal prouvable, là où `x-tenant-id` n'est qu'une
//     affirmation du bot qui retombe sur le défaut quand son cache est froid ;
//   - une clé ORDINAIRE ne peut jamais changer de scope (bot auto-hébergé) ;
//   - tenant ciblé inconnu/inactif → 404, guild étranger → 403 ;
//   - le gate PLAN mord sur le tenant EFFECTIF, pas sur celui de la clé.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetSupabaseMock,
  seedBotAuth,
  CONFERENCE_TENANT_ID,
  BOT_TEST_API_KEY,
  store,
} from './__helpers__/supabaseMock';
import {
  withBotRoute,
  __resetBotIdempotencyCache,
  __resetBotImpersonationCachesForTests,
} from '../../utils/botAuth';
import { __resetBotPlanCacheForTests } from '../../utils/billing/botPlanGate';
import { logger } from '../../utils/logger';

const TENANT_B = '11111111-2222-4333-8444-555555555555';
const TENANT_C = '99999999-8888-4777-8666-555555555555';
const GUILD_CONFERENCE = '1259186540001890474';
const GUILD_B = '222222222222222222';
const GUILD_UNLINKED = '333333333333333333';
const PLATFORM_KEY = BOT_TEST_API_KEY;
const TENANT_KEY = 'tenant-b-own-key';

function makeReq(headers: Record<string, unknown> = {}, method = 'GET'): any {
  return {
    method,
    headers: { host: 'h', 'x-api-key': PLATFORM_KEY, ...headers },
    query: {},
    body: {},
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** Route tenant-scopée qui renvoie simplement le tenant résolu. */
function echoRoute(key = 'platform-key-test') {
  return withBotRoute(
    async (req, res) => res.status(200).json({ tenantId: req.botContext.tenantId }),
    { methods: ['GET'], rateLimit: { max: 1000, key } }
  );
}

beforeEach(() => {
  resetSupabaseMock();
  __resetBotIdempotencyCache();
  __resetBotImpersonationCachesForTests();
  __resetBotPlanCacheForTests();

  // Le tenant flagship porte la clé plateforme (miroir du seed en migration).
  seedBotAuth({ platformKey: true });
  // Tenant B : plan payant actif pour passer le gate baseline `discordBot`,
  // et son propre serveur Discord lié.
  store.tenants.push({
    id: TENANT_B,
    is_active: true,
    plan: 'regie',
    plan_status: 'active',
    plan_expires_at: null,
  });
  store.discord_guilds = [
    { guild_id: GUILD_CONFERENCE, tenant_id: CONFERENCE_TENANT_ID },
    { guild_id: GUILD_B, tenant_id: TENANT_B },
  ];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clé plateforme — le guild tranche', () => {
  it('une commande venue du serveur de B est attribuée à B', async () => {
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-guild-id': GUILD_B }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ tenantId: TENANT_B });
  });

  it('le guild l’emporte sur un x-tenant-id contradictoire (cache bot froid)', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = makeRes();
    // Le cas réel : tenant-config n'a pas encore le guild B en cache, le bot
    // envoie donc le tenant par défaut. Sans arbitrage par le guild, l'appel
    // écrirait chez conference.
    await echoRoute()(
      makeReq({ 'x-guild-id': GUILD_B, 'x-tenant-id': CONFERENCE_TENANT_ID }),
      res
    );
    expect(res.body).toEqual({ tenantId: TENANT_B });
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/guild wins/i);
  });

  it('le serveur du tenant de la clé reste sur ce tenant', async () => {
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-guild-id': GUILD_CONFERENCE }), res);
    expect(res.body).toEqual({ tenantId: CONFERENCE_TENANT_ID });
  });

  it('sans en-tête du tout : comportement historique, la clé décide', async () => {
    const res = makeRes();
    await echoRoute()(makeReq(), res);
    expect(res.body).toEqual({ tenantId: CONFERENCE_TENANT_ID });
  });

  it('guild non lié : on ne refuse pas, on retombe sur la clé', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-guild-id': GUILD_UNLINKED }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ tenantId: CONFERENCE_TENANT_ID });
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/unlinked guild/i);
  });

  it('x-guild-id malformé → 400', async () => {
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-guild-id': 'not-a-snowflake' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_HEADER');
  });
});

describe('clé plateforme — sans guild, l’en-tête tenant est accepté', () => {
  it('x-tenant-id d’un tenant actif → ce tenant', async () => {
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-tenant-id': TENANT_B }), res);
    expect(res.body).toEqual({ tenantId: TENANT_B });
  });

  it('tenant inconnu → 404 UNKNOWN_TENANT', async () => {
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-tenant-id': TENANT_C }), res);
    expect(res.statusCode).toBe(404);
    expect((res.body as any).code).toBe('UNKNOWN_TENANT');
  });

  it('tenant désactivé → 404 UNKNOWN_TENANT', async () => {
    store.tenants.push({
      id: TENANT_C,
      is_active: false,
      plan: 'regie',
      plan_status: 'active',
      plan_expires_at: null,
    });
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-tenant-id': TENANT_C }), res);
    expect(res.statusCode).toBe(404);
  });

  it('x-tenant-id non-UUID → 400 INVALID_TENANT_HEADER', async () => {
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-tenant-id': 'nope' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_TENANT_HEADER');
  });
});

describe('guild étranger', () => {
  it('un guild qui appartient à un AUTRE tenant que la clé bascule sur son propriétaire', async () => {
    // C'est le cœur du correctif : la clé dit « conference », le serveur dit
    // « B ». Le serveur est vérifiable, donc c'est lui qui gagne.
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-guild-id': GUILD_B }), res);
    expect(res.body).toEqual({ tenantId: TENANT_B });
  });
});

describe('clé ordinaire (bot auto-hébergé)', () => {
  beforeEach(() => {
    // Tenant B possède SA clé, non plateforme.
    seedBotAuth({
      tenantId: TENANT_B,
      apiKey: TENANT_KEY,
      withTenantRow: false,
    });
  });

  it('ne peut pas changer de tenant via x-tenant-id', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const res = makeRes();
    await echoRoute()(
      makeReq({ 'x-api-key': TENANT_KEY, 'x-tenant-id': CONFERENCE_TENANT_ID }),
      res
    );
    expect(res.body).toEqual({ tenantId: TENANT_B });
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/key wins/i);
  });

  it('ne peut pas changer de tenant via x-guild-id', async () => {
    const res = makeRes();
    await echoRoute()(
      makeReq({ 'x-api-key': TENANT_KEY, 'x-guild-id': GUILD_CONFERENCE }),
      res
    );
    expect(res.body).toEqual({ tenantId: TENANT_B });
  });
});

describe('gate PLAN sur le tenant effectif', () => {
  it('un tenant impersonné sans plan bot est refusé, même via clé plateforme', async () => {
    store.tenants.push({
      id: TENANT_C,
      is_active: true,
      plan: 'discovery',
      plan_status: 'active',
      plan_expires_at: null,
    });
    store.discord_guilds.push({
      guild_id: GUILD_UNLINKED,
      tenant_id: TENANT_C,
    });
    const res = makeRes();
    await echoRoute()(makeReq({ 'x-guild-id': GUILD_UNLINKED }), res);
    expect(res.statusCode).toBe(403);
    expect((res.body as any).error).toBe('plan_required');
  });
});
