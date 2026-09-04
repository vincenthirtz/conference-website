// tests/unit/apiOnboardTenantRequest.test.ts
//
// Coverage for POST /api/onboard/tenant-request :
//   - 401 if no Supabase session
//   - 400 if invalid slug / reserved slug / bad email / missing turnstile
//   - 400 if Turnstile verification fails
//   - 200 happy path + tenant_requests row created at pending_bot_invite
//     (email pre-verified, no verify email sent)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

// Stub Turnstile verification globally per-test (we flip the result we want).
const verifyMock = vi.fn();
vi.mock('@/utils/turnstile', () => ({
  verifyTurnstileToken: (...args: unknown[]) => verifyMock(...args),
}));

// Stub the Brevo onboard email send.
const sendVerifyMock = vi.fn();
vi.mock('@/utils/emailOnboard', () => ({
  sendOnboardVerifyEmail: (...args: unknown[]) => sendVerifyMock(...args),
  sendOnboardSuccessEmail: vi.fn(),
}));

import {
  store,
  resetSupabaseMock,
  setCookieUser,
  setAdminUserIdentities,
} from './__helpers__/supabaseMock';
import { CGV_VERSION } from '@/utils/billing/cgv';
import handler from '../../pages/api/onboard/tenant-request';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DISCORD_ID = '1234567890123456789';

function makeReq(body: Record<string, unknown>): any {
  return {
    method: 'POST',
    headers: { host: 'h', 'user-agent': 'test-agent' },
    query: {},
    body,
    socket: { remoteAddress: '127.0.0.1' },
    cookies: {},
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
  res.end = () => res;
  return res;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    requested_slug: 'my-org',
    requested_name: 'My Organisation',
    requested_email: 'op@example.com',
    description: 'We host community tournaments.',
    turnstile_token: 'cf-token-fake',
    // Le consentement fait partie du corps NORMAL d'une demande : sans lui
    // l'endpoint refuse, et c'est le sujet des tests dédiés plus bas.
    cgv_version: CGV_VERSION,
    cgv_accepted: true,
    ...overrides,
  };
}

function signIn() {
  setCookieUser({ id: USER_ID });
  setAdminUserIdentities(USER_ID, [
    {
      provider: 'discord',
      identity_data: {
        provider_id: DISCORD_ID,
        user_name: 'OperatorTag',
      },
    },
  ]);
}

beforeEach(() => {
  resetSupabaseMock();
  verifyMock.mockReset();
  verifyMock.mockResolvedValue({ ok: true });
  sendVerifyMock.mockReset();
  sendVerifyMock.mockResolvedValue({ success: true });
});

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
});

describe('POST /api/onboard/tenant-request', () => {
  it('405 sur GET', async () => {
    const res = makeRes();
    await handler({ ...makeReq({}), method: 'GET' } as any, res);
    expect(res.statusCode).toBe(405);
  });

  it('401 si non connecté', async () => {
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(401);
    expect((res.body as any).code).toBe('UNAUTHENTICATED');
  });

  it('400 si slug invalide (chars interdits)', async () => {
    signIn();
    const res = makeRes();
    await handler(makeReq(validBody({ requested_slug: 'INVALID!' })), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
    expect((res.body as any).fields.requested_slug).toBeDefined();
  });

  it('400 si slug réservé', async () => {
    signIn();
    const res = makeRes();
    await handler(makeReq(validBody({ requested_slug: 'admin' })), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });

  it('400 si email invalide', async () => {
    signIn();
    const res = makeRes();
    await handler(
      makeReq(validBody({ requested_email: 'not-an-email' })),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_BODY');
  });

  it('400 si Turnstile invalide', async () => {
    signIn();
    verifyMock.mockResolvedValue({ ok: false, error: 'bad token' });
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('INVALID_CAPTCHA');
  });

  it('happy path → insère tenant_request à pending_bot_invite (sans email)', async () => {
    signIn();
    const res = makeRes();
    await handler(makeReq(validBody()), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
    expect((res.body as any).status).toBe('pending_bot_invite');

    const rows = store.tenant_requests ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].requested_slug).toBe('my-org');
    expect(rows[0].requester_discord_user_id).toBe(DISCORD_ID);
    expect(rows[0].requester_auth_user_id).toBe(USER_ID);
    // Straight to pending_bot_invite, email pre-verified — the requester is
    // already Discord-authenticated, so no verification round-trip.
    expect(rows[0].status).toBe('pending_bot_invite');
    expect(typeof rows[0].email_verified_at).toBe('string');
    expect(rows[0].email_verification_token ?? null).toBeNull();

    // No verification email is sent anymore.
    expect(sendVerifyMock).not.toHaveBeenCalled();
  });

  it('sans acceptation des CGV → 400, aucune demande créée', async () => {
    signIn();
    // Ouvrir un espace, même sur l'essai gratuit, c'est entrer dans la relation
    // que les conditions régissent. Attendre le premier paiement laisserait
    // trente jours de service rendu sans qu'aucun texte n'ait été accepté.
    const res = makeRes();
    const body = validBody();
    delete (body as Record<string, unknown>).cgv_accepted;
    await handler(makeReq(body), res);
    expect(res.statusCode).toBe(400);
    expect(store.tenant_requests ?? []).toHaveLength(0);
  });

  it('version de CGV périmée → 409', async () => {
    signIn();
    const res = makeRes();
    await handler(makeReq(validBody({ cgv_version: '1999-01-01' })), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('CGV_VERSION_STALE');
    expect(store.tenant_requests ?? []).toHaveLength(0);
  });

  it('la demande porte la version acceptée et sa date', async () => {
    signIn();
    // Le consentement doit VOYAGER : l'espace est créé plus tard par le
    // rattachement du serveur Discord, une étape machine où plus personne ne
    // peut accepter quoi que ce soit.
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(200);
    const row = (store.tenant_requests ?? [])[0] as any;
    expect(row.cgv_version).toBe(CGV_VERSION);
    expect(typeof row.cgv_accepted_at).toBe('string');
  });

  it('409 si slug existe déjà côté tenants', async () => {
    signIn();
    store.tenants = [{ id: 'tnt-1', slug: 'my-org' }];
    const res = makeRes();
    await handler(makeReq(validBody()), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as any).code).toBe('SLUG_TAKEN');
    // Cleanup happened : the row inserted before the slug check was deleted.
    expect((store.tenant_requests ?? []).length).toBe(0);
  });
});
