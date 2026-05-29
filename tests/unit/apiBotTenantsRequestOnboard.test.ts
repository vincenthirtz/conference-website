// tests/unit/apiBotTenantsRequestOnboard.test.ts
//
// Tests pour POST /api/bot/v1/tenants/request-onboard :
//   - 401 sans x-api-key (per-tenant auth)
//   - 405 sur GET
//   - 400 sur body invalide (slug invalide / reserve / nom vide / email
//     malforme / discord_user_id non-snowflake / discord display name trop
//     long est tronque a 200 chars OK)
//   - 500 si DISCORD_CLIENT_ID est absent (impossible de generer l'invite)
//   - 409 si un tenant existant porte deja le slug demande
//   - 200 happy path : row inseree avec source='discord_command',
//     status='pending_bot_invite', email_verified_at!=null,
//     email_verification_token=null, requester_auth_user_id=null

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  seedBotAuth,
} from './__helpers__/supabaseMock';
import handler from '../../pages/api/bot/v1/tenants/request-onboard';

const DISCORD_ID = '1234567890123456789';

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

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    requesterDiscordUserId: DISCORD_ID,
    requesterDiscordDisplayName: 'OperatorTag',
    requestedSlug: 'my-org',
    requestedName: 'My Organisation',
    requesterEmail: 'op@example.com',
    description: 'We host community tournaments.',
    ...overrides,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  // Per-tenant bot auth (crossTenant route still requires a valid x-api-key).
  seedBotAuth();
  process.env.DISCORD_CLIENT_ID = '1380000000000000000';
  process.env.DISCORD_BOT_PERMISSIONS = '1099780063312';
});

afterEach(() => {
  delete process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_BOT_PERMISSIONS;
});

describe('POST /api/bot/v1/tenants/request-onboard', () => {
  it('401 sans api key', async () => {
    const res = makeRes();
    await handler(
      { ...makeReq(validBody()), headers: { host: 'h' } } as any,
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('405 sur GET', async () => {
    const res = makeRes();
    await handler({ ...makeReq(validBody()), method: 'GET' } as any, res);
    expect(res.statusCode).toBe(405);
  });

  it('400 si discord_user_id non-snowflake', async () => {
    const res = makeRes();
    await handler(
      makeReq(validBody({ requesterDiscordUserId: 'not-a-snowflake' })),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect((res.body as any).fields.requesterDiscordUserId).toBeDefined();
  });

  it('400 si slug invalide (chars interdits)', async () => {
    const res = makeRes();
    await handler(makeReq(validBody({ requestedSlug: 'INVALID!' })), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect((res.body as any).fields.requestedSlug).toBeDefined();
  });

  it('400 si slug réservé', async () => {
    const res = makeRes();
    await handler(makeReq(validBody({ requestedSlug: 'admin' })), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect((res.body as any).fields.requestedSlug).toBeDefined();
  });

  it('400 si nom vide', async () => {
    const res = makeRes();
    await handler(makeReq(validBody({ requestedName: '   ' })), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect((res.body as any).fields.requestedName).toBeDefined();
  });

  it('400 si email malforme', async () => {
    const res = makeRes();
    await handler(makeReq(validBody({ requesterEmail: 'not-an-email' })), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect((res.body as any).fields.requesterEmail).toBeDefined();
  });

  it('500 si DISCORD_CLIENT_ID absent', async () => {
    delete process.env.DISCORD_CLIENT_ID;
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(500);
    expect((res.body as any).code).toBe('BOT_INVITE_UNAVAILABLE');
    // No row should have been written.
    expect((store.tenant_requests ?? []).length).toBe(0);
  });

  it('409 si slug existe deja dans tenants', async () => {
    store.tenants = [{ id: 'tnt-existing', slug: 'my-org' }];
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('SLUG_TAKEN');
    expect((store.tenant_requests ?? []).length).toBe(0);
  });

  it('happy path → insère row avec source=discord_command + email pre-verifie', async () => {
    const res = makeRes();
    await handler(makeReq(validBody()), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(typeof body.requestId).toBe('string');
    expect(body.botInviteUrl).toContain(
      'https://discord.com/oauth2/authorize?'
    );
    expect(body.botInviteUrl).toContain('client_id=1380000000000000000');
    expect(body.botInviteUrl).toContain('scope=bot+applications.commands');
    expect(body.secretsRevealHint).toBe(
      'user will receive DM with bot invite URL'
    );

    const rows = store.tenant_requests ?? [];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.source).toBe('discord_command');
    expect(row.status).toBe('pending_bot_invite');
    expect(row.email_verified_at).toBeTruthy();
    expect(row.email_verification_token).toBeNull();
    expect(row.requester_auth_user_id).toBeNull();
    expect(row.requester_discord_user_id).toBe(DISCORD_ID);
    expect(row.requester_discord_display_name).toBe('OperatorTag');
    expect(row.requester_email).toBe('op@example.com'); // lowercased by schema
    expect(row.requested_slug).toBe('my-org');
    expect(row.requested_name).toBe('My Organisation');
    expect(row.description).toBe('We host community tournaments.');
    expect(row.ip_address).toBeNull();
    expect(row.user_agent).toBeNull();
  });

  it('happy path — display name null accepté', async () => {
    const res = makeRes();
    await handler(
      makeReq(validBody({ requesterDiscordDisplayName: null })),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.tenant_requests ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].requester_discord_display_name).toBeNull();
  });

  it('happy path — display name absent accepté', async () => {
    const body = validBody();
    delete (body as Record<string, unknown>).requesterDiscordDisplayName;
    const res = makeRes();
    await handler(makeReq(body), res);
    expect(res.statusCode).toBe(200);
    const rows = store.tenant_requests ?? [];
    expect(rows[0].requester_discord_display_name).toBeNull();
  });

  it('happy path — description optionnelle (string vide tolérée)', async () => {
    const res = makeRes();
    await handler(makeReq(validBody({ description: '' })), res);
    expect(res.statusCode).toBe(200);
    const rows = store.tenant_requests ?? [];
    expect(rows[0].description).toBeNull();
  });

  it("happy path — l'email est lowercased par le schéma", async () => {
    const res = makeRes();
    await handler(
      makeReq(validBody({ requesterEmail: 'OP@Example.COM' })),
      res
    );
    expect(res.statusCode).toBe(200);
    const rows = store.tenant_requests ?? [];
    expect(rows[0].requester_email).toBe('op@example.com');
  });
});
