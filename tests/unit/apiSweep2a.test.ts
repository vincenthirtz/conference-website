// Sweep 2a: small-to-medium 0% public/auth handlers + helloasso.
//
// Targets:
//  - pages/api/news/rss.ts
//  - pages/api/partnership-requests/index.ts
//  - pages/api/player/data-export.ts
//  - pages/api/twitch/oauth-callback.ts
//  - pages/api/helloasso/checkout.ts
//  - pages/api/helloasso/webhook.ts
//  - utils/helloasso.ts (token + checkout + memberships + payments + forms)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  sendPartnershipStaffEmail,
  sendPartnershipConfirmationEmail,
  createCheckoutIntent,
} = vi.hoisted(() => ({
  sendPartnershipStaffEmail: vi.fn(async () => undefined),
  sendPartnershipConfirmationEmail: vi.fn(async () => undefined),
  createCheckoutIntent: vi.fn<(...args: any[]) => any>(async () => ({
    id: 1,
    redirectUrl: 'https://helloasso/redirect',
  })),
}));

vi.mock('@/utils/email', () => ({
  sendPartnershipStaffEmail,
  sendPartnershipConfirmationEmail,
}));

// For checkout.ts handler we want a fully mocked helloasso util — but for
// utils/helloasso.ts unit tests we use the real module. Expose a hoisted
// mock that points to the real implementation by default.
vi.mock('@/utils/helloasso', async () => {
  const real =
    await vi.importActual<typeof import('../../utils/helloasso')>(
      '@/utils/helloasso'
    );
  return {
    ...real,
    createCheckoutIntent,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';

import rssHandler from '../../pages/api/news/rss';
import partnershipHandler from '../../pages/api/partnership-requests/index';
import dataExportHandler from '../../pages/api/player/data-export';
import oauthCallbackHandler from '../../pages/api/twitch/oauth-callback';
import checkoutHandler from '../../pages/api/helloasso/checkout';
import webhookHandler from '../../pages/api/helloasso/webhook';

import { invalidateStaffCache } from '../../utils/staff';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h' },
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
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
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    sentBody: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.sentBody = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendPartnershipStaffEmail.mockClear();
  sendPartnershipConfirmationEmail.mockClear();
  createCheckoutIntent.mockClear();
});

/* -----------------------------------------------------------
 * /api/news/rss
 * ---------------------------------------------------------*/

describe('/api/news/rss', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    await rssHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns RSS XML with items', async () => {
    store.news = [
      {
        id: 'n1',
        title: 'Title <one>',
        slug: 'title-one',
        tag: 'teams',
        excerpt: 'short & sweet',
        content: 'long body',
        published_at: '2026-04-01T00:00:00.000Z',
        status: 'published',
      },
      {
        id: 'n2',
        title: 'No excerpt',
        slug: 'no-excerpt',
        tag: null,
        excerpt: null,
        content: 'only content',
        published_at: null,
        status: 'published',
      },
    ] as any;
    const res = makeRes();
    await rssHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('rss+xml');
    const xml = res.sentBody as string;
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('Title &lt;one&gt;');
    expect(xml).toContain('short &amp; sweet');
    expect(xml).toContain('<category>teams</category>');
    expect(xml).toContain('<category>general</category>');
  });

  it('GET returns RSS with no items when empty', async () => {
    const res = makeRes();
    await rssHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect((res.sentBody as string).includes('<rss')).toBe(true);
  });
});

/* -----------------------------------------------------------
 * /api/partnership-requests
 * ---------------------------------------------------------*/

describe('/api/partnership-requests', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await partnershipHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid body', async () => {
    const res = makeRes();
    await partnershipHandler(
      makeReq({ method: 'POST', body: { email: 'not-an-email' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('201 on valid body, queues both emails', async () => {
    const res = makeRes();
    await partnershipHandler(
      makeReq({
        method: 'POST',
        headers: {
          host: 'h',
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
          'user-agent': 'curl/8',
        },
        body: {
          companyName: 'Acme',
          contactName: 'John',
          email: 'john@acme.com',
          phone: ' +33 1 ',
          website: 'https://acme.com',
          category: 'major',
          message: 'hello',
          budgetRange: ' 10k ',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).success).toBe(true);
    // both emails fired (fire-and-forget)
    await Promise.resolve();
    expect(sendPartnershipStaffEmail).toHaveBeenCalled();
    expect(sendPartnershipConfirmationEmail).toHaveBeenCalled();
    // request was inserted
    expect((store.partnership_requests || []).length).toBe(1);
    const inserted = (store.partnership_requests as any[])[0];
    expect(inserted.ip_address).toBe('1.2.3.4');
    expect(inserted.user_agent).toBe('curl/8');
    expect(inserted.budget_range).toBe('10k');
  });

  it('handles missing x-forwarded-for (uses socket addr)', async () => {
    const res = makeRes();
    await partnershipHandler(
      makeReq({
        method: 'POST',
        body: {
          companyName: 'Acme',
          contactName: 'John',
          email: 'j@a.com',
          category: 'other',
          message: 'hi',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });
});

/* -----------------------------------------------------------
 * /api/player/data-export
 * ---------------------------------------------------------*/

describe('/api/player/data-export', () => {
  it('401 when unauthenticated', async () => {
    const res = makeRes();
    await dataExportHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('405 on POST', async () => {
    setAuthUser({
      id: 'u1',
      email: 'u@x.com',
      created_at: '2026-01-01',
      last_sign_in_at: null,
      user_metadata: {},
    });
    const res = makeRes();
    await dataExportHandler(makeAuthedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('GET returns assembled data with headers', async () => {
    setAuthUser({
      id: 'u1',
      email: 'u@x.com',
      created_at: '2026-01-01',
      last_sign_in_at: '2026-04-01',
      user_metadata: {
        display_name: 'Player1',
        battle_tag: 'P#1',
        role: 'player',
      },
    });
    store.team_members = [
      { id: 'tm1', user_id: 'u1', role: 'player', joined_at: '2026-02-01' },
    ] as any;
    store.demandes = [
      {
        id: 'd1',
        user_id: 'u1',
        type: 'join',
        status: 'pending',
        created_at: '2026-03-01',
      },
    ] as any;
    store.staff = [
      {
        id: 's1',
        auth_user_id: 'u1',
        role: 'caster',
        created_at: '2026-01-15',
      },
    ] as any;

    const res = makeRes();
    await dataExportHandler(makeAuthedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.headers['Content-Disposition']).toContain('mes-donnees.json');
    const body = res.body as any;
    expect(body.account.id).toBe('u1');
    expect(body.account.display_name).toBe('Player1');
    expect(body.team_membership).toHaveLength(1);
    expect(body.demandes).toHaveLength(1);
    expect(body.staff).not.toBeNull();
  });
});

/* -----------------------------------------------------------
 * /api/twitch/oauth-callback
 * ---------------------------------------------------------*/

describe('/api/twitch/oauth-callback', () => {
  it('405 on POST', async () => {
    const res = makeRes();
    oauthCallbackHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when code missing', async () => {
    const res = makeRes();
    oauthCallbackHandler(makeReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('200 with code+state', async () => {
    const res = makeRes();
    oauthCallbackHandler(
      makeReq({ method: 'GET', query: { code: 'abc', state: 'xyz' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).code).toBe('abc');
    expect((res.body as any).state).toBe('xyz');
  });

  it('200 with code only (no state)', async () => {
    const res = makeRes();
    oauthCallbackHandler(
      makeReq({ method: 'GET', query: { code: 'abc' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).state).toBeUndefined();
  });
});

/* -----------------------------------------------------------
 * /api/helloasso/checkout
 * ---------------------------------------------------------*/

describe('/api/helloasso/checkout', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await checkoutHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid body (amount too small)', async () => {
    const res = makeRes();
    await checkoutHandler(
      makeReq({
        method: 'POST',
        body: {
          amount: 50,
          firstName: 'A',
          lastName: 'B',
          email: 'a@b.com',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 returns redirectUrl', async () => {
    const res = makeRes();
    await checkoutHandler(
      makeReq({
        method: 'POST',
        headers: {
          host: 'mysite.com',
          'x-forwarded-proto': 'https',
        },
        body: {
          amount: 1000,
          firstName: 'A',
          lastName: 'B',
          email: 'a@b.com',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).redirectUrl).toBe('https://helloasso/redirect');
    expect(createCheckoutIntent).toHaveBeenCalledOnce();
    const args = createCheckoutIntent.mock.calls[0][0] as any;
    expect(args.returnUrl).toContain('https://mysite.com/don?status=success');
  });

  it('502 when checkout intent throws', async () => {
    createCheckoutIntent.mockRejectedValueOnce(new Error('upstream down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await checkoutHandler(
      makeReq({
        method: 'POST',
        body: {
          amount: 1000,
          firstName: 'A',
          lastName: 'B',
          email: 'a@b.com',
        },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(502);
  });
});

/* -----------------------------------------------------------
 * /api/helloasso/webhook
 * ---------------------------------------------------------*/

describe('/api/helloasso/webhook', () => {
  it('405 on GET', async () => {
    const res = makeRes();
    await webhookHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 on invalid payload', async () => {
    const res = makeRes();
    await webhookHandler(makeReq({ method: 'POST', body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it('200 on valid payload', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = makeRes();
    await webhookHandler(
      makeReq({
        method: 'POST',
        body: {
          eventType: 'Order',
          data: {
            amount: 2500,
            state: 'Authorized',
            payer: { email: 'p@x.com' },
          },
        },
      }),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(200);
    expect((res.body as any).ok).toBe(true);
  });
});
