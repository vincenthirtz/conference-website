// tests/unit/apiBotTenantsLinkGuild.test.ts
//
// Tests pour POST /api/bot/v1/tenants/link-guild :
//   - 400 sur validation body (guild_id manquant / malforme, owner_discord_id invalide)
//   - 200 already_linked si le guild est deja dans discord_guilds
//   - 200 pending_admin_link sinon (upsert dans pending_guild_links)
//   - Idempotence : 2 appels successifs pour un guild inconnu mettent a jour la
//     meme row dans pending_guild_links (PK = guild_id).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/tenants/link-guild';

const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const KNOWN_GUILD_ID = '1259186540001890474';
const NEW_GUILD_ID = '9999999999999999999';
const OWNER_ID = '1111222233334444555';

function makeReq(body: Record<string, unknown>): any {
  return {
    method: 'POST',
    headers: { host: 'h', 'x-api-key': 'test-key' },
    query: {},
    body,
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

beforeEach(() => {
  resetSupabaseMock();
  process.env.BOT_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.BOT_API_KEY;
});

describe('POST /api/bot/v1/tenants/link-guild', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(
      { ...makeReq({ guild_id: NEW_GUILD_ID }), headers: { host: 'h' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await handler({ ...makeReq({}), method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('400 si guild_id absent', async () => {
    const res = makeRes();
    await handler(makeReq({}), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_ID');
  });

  it('400 si guild_id malforme', async () => {
    const res = makeRes();
    await handler(makeReq({ guild_id: 'pas-un-snowflake' }), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_GUILD_ID');
  });

  it('400 si owner_discord_id malforme', async () => {
    const res = makeRes();
    await handler(
      makeReq({ guild_id: NEW_GUILD_ID, owner_discord_id: 'xxx' }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_OWNER_ID');
  });

  it('already_linked si guild deja mappe', async () => {
    store.discord_guilds = [
      {
        guild_id: KNOWN_GUILD_ID,
        is_primary: true,
        tenant: {
          id: CONFERENCE_TENANT_ID,
          slug: 'conference',
        },
      },
    ] as any;

    const res = makeRes();
    await handler(
      makeReq({
        guild_id: KNOWN_GUILD_ID,
        guild_name: 'Nom changé',
        owner_discord_id: OWNER_ID,
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).status).toBe('already_linked');
    expect((res.body as any).tenant_id).toBe(CONFERENCE_TENANT_ID);
    expect((res.body as any).tenant_slug).toBe('conference');
    expect((res.body as any).guild_id).toBe(KNOWN_GUILD_ID);
    // Pas de row creee dans pending_guild_links.
    expect(store.pending_guild_links ?? []).toHaveLength(0);
  });

  it('pending_admin_link + upsert dans pending_guild_links pour un guild inconnu', async () => {
    store.discord_guilds = [];

    const res = makeRes();
    await handler(
      makeReq({
        guild_id: NEW_GUILD_ID,
        guild_name: 'Nouveau Serveur',
        owner_discord_id: OWNER_ID,
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.status).toBe('pending_admin_link');
    expect(body.guild_id).toBe(NEW_GUILD_ID);
    expect(body.guild_name).toBe('Nouveau Serveur');
    expect(body.owner_discord_id).toBe(OWNER_ID);

    const rows = store.pending_guild_links ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].guild_id).toBe(NEW_GUILD_ID);
    expect(rows[0].guild_name).toBe('Nouveau Serveur');
    expect(rows[0].owner_discord_id).toBe(OWNER_ID);
  });

  it('idempotent : 2 appels successifs upsertent la meme row (1 seule)', async () => {
    store.discord_guilds = [];

    const res1 = makeRes();
    await handler(makeReq({ guild_id: NEW_GUILD_ID, guild_name: 'V1' }), res1);
    expect((res1.body as any).status).toBe('pending_admin_link');

    const res2 = makeRes();
    await handler(
      makeReq({ guild_id: NEW_GUILD_ID, guild_name: 'V2 renamed' }),
      res2
    );
    expect((res2.body as any).status).toBe('pending_admin_link');

    const rows = store.pending_guild_links ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].guild_name).toBe('V2 renamed');
  });

  it('owner_discord_id optionnel — accepte null/absent', async () => {
    store.discord_guilds = [];

    const res = makeRes();
    await handler(
      makeReq({ guild_id: NEW_GUILD_ID, guild_name: 'sans owner' }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((res.body as any).owner_discord_id).toBeNull();
    const rows = store.pending_guild_links ?? [];
    expect(rows[0].owner_discord_id).toBeNull();
  });
});
