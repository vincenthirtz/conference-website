// tests/unit/apiBotTenantsLinkGuild.test.ts
//
// Tests pour POST /api/bot/v1/tenants/link-guild :
//   - 400 sur validation body (guild_id manquant / malforme, owner_discord_id invalide)
//   - 200 already_linked si le guild est deja dans discord_guilds
//   - 200 pending_admin_link sinon (upsert dans pending_guild_links)
//   - Idempotence : 2 appels successifs pour un guild inconnu mettent a jour la
//     meme row dans pending_guild_links (PK = guild_id).
//   - 200 auto_claimed si owner_discord_id matche un tenant_request actif
//     (status='pending_bot_invite', email_verified_at non-null, <7j).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const sendSuccessMock = vi.fn();
vi.mock('@/utils/emailOnboard', () => ({
  sendOnboardVerifyEmail: vi.fn(),
  sendOnboardSuccessEmail: (...args: unknown[]) => sendSuccessMock(...args),
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/tenants/link-guild';

const CONFERENCE_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const KNOWN_GUILD_ID = '1259186540001890474';
const NEW_GUILD_ID = '9999999999999999999';
const OWNER_ID = '1111222233334444555';
const REQUESTER_AUTH_USER_ID = '55555555-5555-5555-5555-555555555555';

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
  sendSuccessMock.mockReset();
  sendSuccessMock.mockResolvedValue({ success: true });
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

  describe('auto-claim (onboarding)', () => {
    function seedActiveRequest(overrides: Record<string, unknown> = {}) {
      store.tenant_requests = [
        {
          id: 'req-1',
          requester_auth_user_id: REQUESTER_AUTH_USER_ID,
          requester_discord_user_id: OWNER_ID,
          requester_discord_display_name: 'Operator',
          requester_email: 'op@example.com',
          requested_slug: 'fresh-org',
          requested_name: 'Fresh Org',
          status: 'pending_bot_invite',
          email_verified_at: '2026-05-21T10:00:00Z',
          created_at: new Date().toISOString(),
          ...overrides,
        },
      ];
    }

    it('auto_claimed si owner match un tenant_request actif vérifié', async () => {
      store.discord_guilds = [];
      seedActiveRequest();

      const res = makeRes();
      await handler(
        makeReq({
          guild_id: NEW_GUILD_ID,
          guild_name: 'Fresh Guild',
          owner_discord_id: OWNER_ID,
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      const body = res.body as any;
      expect(body.status).toBe('auto_claimed');
      expect(body.tenant_slug).toBe('fresh-org');
      expect(typeof body.tenant_id).toBe('string');

      // tenants row created
      expect((store.tenants ?? []).length).toBe(1);
      expect((store.tenants ?? [])[0].slug).toBe('fresh-org');

      // discord_guilds linked
      const guilds = store.discord_guilds ?? [];
      expect(guilds).toHaveLength(1);
      expect(guilds[0].guild_id).toBe(NEW_GUILD_ID);
      expect(guilds[0].is_primary).toBe(true);

      // tenant_secrets minted (hashed key)
      expect((store.tenant_secrets ?? []).length).toBe(1);
      const sec = (store.tenant_secrets ?? [])[0];
      expect(typeof sec.bot_api_key_hash).toBe('string');
      expect((sec.bot_api_key_hash as string).length).toBe(64);
      expect(typeof sec.bot_webhook_secret).toBe('string');

      // staff row created (caster) + tenant_staff (owner)
      const staffRows = store.staff ?? [];
      expect(staffRows).toHaveLength(1);
      expect(staffRows[0].auth_user_id).toBe(REQUESTER_AUTH_USER_ID);
      expect(staffRows[0].role).toBe('caster');

      const tenantStaff = store.tenant_staff ?? [];
      expect(tenantStaff).toHaveLength(1);
      expect(tenantStaff[0].role).toBe('owner');

      // tenant_discord_config row exists
      expect((store.tenant_discord_config ?? []).length).toBe(1);

      // tenant_requests transitioned to completed with reveal token + secrets
      const req = (store.tenant_requests ?? [])[0];
      expect(req.status).toBe('completed');
      expect(req.created_tenant_id).toBeTruthy();
      expect(req.created_guild_id).toBe(NEW_GUILD_ID);
      expect(typeof req.secrets_reveal_token).toBe('string');
      expect((req.secrets_reveal_token as string).length).toBe(64);
      expect(req.pending_secrets_reveal).toBeTruthy();
      const stash = req.pending_secrets_reveal as Record<string, string>;
      expect(typeof stash.botApiKey).toBe('string');
      expect(typeof stash.botWebhookSecret).toBe('string');

      // Email sent
      expect(sendSuccessMock).toHaveBeenCalledTimes(1);
      const call = sendSuccessMock.mock.calls[0][0];
      expect(call.to).toBe('op@example.com');
      expect(call.tenantSlug).toBe('fresh-org');
      expect(call.revealUrl).toContain('/onboard/secrets/');
    });

    it('fallback pending_admin_link si email non vérifié', async () => {
      store.discord_guilds = [];
      seedActiveRequest({ email_verified_at: null });

      const res = makeRes();
      await handler(
        makeReq({
          guild_id: NEW_GUILD_ID,
          guild_name: 'No Verify',
          owner_discord_id: OWNER_ID,
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect((res.body as any).status).toBe('pending_admin_link');
      // No tenant should have been created
      expect((store.tenants ?? []).length).toBe(0);
      // Fallback row written
      expect((store.pending_guild_links ?? []).length).toBe(1);
    });

    it('fallback pending_admin_link si status != pending_bot_invite', async () => {
      store.discord_guilds = [];
      seedActiveRequest({ status: 'pending_email_verification' });

      const res = makeRes();
      await handler(
        makeReq({
          guild_id: NEW_GUILD_ID,
          owner_discord_id: OWNER_ID,
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect((res.body as any).status).toBe('pending_admin_link');
      expect((store.tenants ?? []).length).toBe(0);
    });

    it('fallback pending_admin_link si pas de owner_discord_id', async () => {
      store.discord_guilds = [];
      seedActiveRequest();

      const res = makeRes();
      await handler(
        makeReq({
          guild_id: NEW_GUILD_ID,
          guild_name: 'no owner',
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect((res.body as any).status).toBe('pending_admin_link');
    });

    it('fallback pending_admin_link si owner ne matche aucune request', async () => {
      store.discord_guilds = [];
      seedActiveRequest({ requester_discord_user_id: '9999999999999999000' });

      const res = makeRes();
      await handler(
        makeReq({
          guild_id: NEW_GUILD_ID,
          owner_discord_id: OWNER_ID,
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect((res.body as any).status).toBe('pending_admin_link');
    });
  });
});
