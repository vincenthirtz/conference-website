// Unit tests for utils/helloasso.ts (real module, fetch-mocked).
// Kept in its own file so other suites that mock @/utils/helloasso don't
// shadow the real implementation here.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createCheckoutIntent,
  fetchMemberships,
  fetchPayments,
  fetchForms,
} from '../../utils/helloasso';

describe('utils/helloasso', () => {
  let fetchSpy: any;
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    process.env.HELLOASSO_CLIENT_ID = 'id';
    process.env.HELLOASSO_CLIENT_SECRET = 'sec';
    process.env.HELLOASSO_ORG_SLUG = 'my-org';
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    fetchSpy?.mockRestore?.();
  });

  it('createCheckoutIntent: throws when env vars missing', async () => {
    delete process.env.HELLOASSO_CLIENT_ID;
    await expect(
      createCheckoutIntent({
        totalAmount: 1000,
        payer: { firstName: 'a', lastName: 'b', email: 'c@d.com' },
        returnUrl: 'https://x',
        errorUrl: 'https://y',
      })
    ).rejects.toThrow(/Missing HelloAsso env vars/);
  });

  it('createCheckoutIntent: throws on OAuth error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid creds',
    } as any);

    await expect(
      createCheckoutIntent({
        totalAmount: 1000,
        payer: { firstName: 'A', lastName: 'B', email: 'c@d.com' },
        returnUrl: 'https://ok',
        errorUrl: 'https://err',
      })
    ).rejects.toThrow(/HelloAsso OAuth error 401/);
  });

  it('createCheckoutIntent: token then checkout call (success)', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42, redirectUrl: 'https://r' }),
      } as any);

    const out = await createCheckoutIntent({
      totalAmount: 1000,
      payer: { firstName: 'A', lastName: 'B', email: 'c@d.com' },
      returnUrl: 'https://ok',
      errorUrl: 'https://err',
    });
    expect(out.id).toBe(42);
    expect(out.redirectUrl).toBe('https://r');
    const secondCallUrl = fetchSpy.mock.calls[1][0];
    expect(secondCallUrl).toContain('/v5/organizations/my-org/checkout-intents');
  });

  it('fetchMemberships uses cached token (single fetch call)', async () => {
    // Token was cached by the previous successful test.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        pagination: {
          pageIndex: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 0,
        },
      }),
    } as any);
    const out = await fetchMemberships('my-form', 1, 10);
    expect(out.data).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('createCheckoutIntent: throws on checkout error', async () => {
    // Token still cached.
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as any);

    await expect(
      createCheckoutIntent({
        totalAmount: 1000,
        payer: { firstName: 'A', lastName: 'B', email: 'c@d.com' },
        returnUrl: 'https://ok',
        errorUrl: 'https://err',
      })
    ).rejects.toThrow(/HelloAsso checkout error 500/);
  });

  it('fetchMemberships: throws on error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'gateway',
    } as any);
    await expect(fetchMemberships('my-form')).rejects.toThrow(
      /HelloAsso memberships error 502/
    );
  });

  it('fetchPayments works with optional filters', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        pagination: {
          pageIndex: 1,
          pageSize: 100,
          totalCount: 0,
          totalPages: 0,
        },
      }),
    } as any);
    await fetchPayments({
      from: '2026-01-01',
      to: '2026-04-30',
      pageIndex: 2,
      pageSize: 50,
    });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-04-30');
    expect(url).toContain('pageIndex=2');
  });

  it('fetchPayments: throws on error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'no',
    } as any);
    await expect(fetchPayments()).rejects.toThrow(
      /HelloAsso payments error 503/
    );
  });

  it('fetchForms returns the data array', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            formSlug: 'f1',
            formType: 'Membership',
            title: 'T',
            state: 'Public',
          },
        ],
        pagination: {
          pageIndex: 1,
          pageSize: 100,
          totalCount: 1,
          totalPages: 1,
        },
      }),
    } as any);
    const list = await fetchForms();
    expect(list.length).toBe(1);
  });

  it('fetchForms: throws on error', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'no',
    } as any);
    await expect(fetchForms()).rejects.toThrow(/HelloAsso forms error 500/);
  });
});
