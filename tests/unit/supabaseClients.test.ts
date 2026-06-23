// Unit tests for utils/supabase.ts and utils/supabaseAdmin.ts.
//
// These modules are normally swapped out by tests/unit/__helpers__/supabaseMock.
// Here we import the REAL implementations after setting fake env vars, so the
// (small) module body and getServerClient cookie wrappers get exercised.

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Global setup remaps @/utils/supabase to the in-memory mock. This file tests
// the REAL implementation, so cancel that remap before importing the module.
vi.unmock('@/utils/supabase');
vi.unmock('../../utils/supabase');

// Capture the options passed to createServerClient so we can drive the cookie
// callbacks (getAll / setAll, @supabase/ssr 0.12) directly. We can't easily
// call them through the real Supabase auth flow without making network calls.
const captured: { opts: any } = { opts: null };
vi.mock('@supabase/ssr', async () => {
  const actual =
    await vi.importActual<typeof import('@supabase/ssr')>('@supabase/ssr');
  return {
    ...actual,
    createServerClient: (_url: any, _key: any, opts: any) => {
      captured.opts = opts;
      return { from: () => ({}), auth: {} };
    },
  };
});

// Set fake env BEFORE importing the modules. supabase.ts throws at module-load
// time if either of these is missing.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-fake';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-fake';
});

describe('utils/supabaseAdmin', () => {
  it('exports a Supabase client with from() / auth fields', async () => {
    const mod = await import('../../utils/supabaseAdmin');
    expect(mod.supabaseAdmin).toBeTruthy();
    expect(typeof mod.supabaseAdmin.from).toBe('function');
    expect(mod.supabaseAdmin.auth).toBeTruthy();
  });
});

describe('utils/supabase', () => {
  it('exports supabaseClient and getServerClient', async () => {
    const mod = await import('../../utils/supabase');
    expect(mod.supabaseClient).toBeTruthy();
    expect(typeof mod.getServerClient).toBe('function');
  });

  it('getServerClient cookie callbacks harden options and append correctly', async () => {
    const mod = await import('../../utils/supabase');

    const headers: Record<string, string | string[]> = {};
    const req: any = { cookies: { 'sb-access': 'tok' } };
    const res: any = {
      getHeader: (k: string) => headers[k],
      setHeader: (k: string, v: string | string[]) => {
        headers[k] = v;
      },
    };

    mod.getServerClient(req, res);
    expect(captured.opts).toBeTruthy();
    const cookies = captured.opts.cookies;

    // getAll
    expect(cookies.getAll()).toEqual([{ name: 'sb-access', value: 'tok' }]);

    // First setAll: no existing Set-Cookie → string
    cookies.setAll([{ name: 'sb-1', value: 'v1', options: {} }], {});
    expect(typeof headers['Set-Cookie']).toBe('string');

    // Second setAll: existing string → array
    cookies.setAll(
      [{ name: 'sb-2', value: 'v2', options: { sameSite: 'strict' } }],
      {}
    );
    expect(Array.isArray(headers['Set-Cookie'])).toBe(true);

    // Third setAll: existing array → push
    cookies.setAll([{ name: 'sb-3', value: 'v3', options: {} }], {});
    expect((headers['Set-Cookie'] as string[]).length).toBeGreaterThanOrEqual(
      3
    );

    // removal → setAll with empty value + expiry options (supabase-js shape)
    cookies.setAll([{ name: 'sb-1', value: '', options: { maxAge: 0 } }], {});

    // anti-cache headers (0.12) are forwarded onto the response
    cookies.setAll(
      [{ name: 'sb-4', value: 'v4', options: {} }],
      { 'Cache-Control': 'private, no-store' }
    );
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('sb-* auth cookies are NOT httpOnly so the browser client can read them', async () => {
    const mod = await import('../../utils/supabase');

    const headers: Record<string, string | string[]> = {};
    const req: any = { cookies: {} };
    const res: any = {
      getHeader: (k: string) => headers[k],
      setHeader: (k: string, v: string | string[]) => {
        headers[k] = v;
      },
    };

    mod.getServerClient(req, res);
    const cookies = captured.opts.cookies;

    cookies.setAll(
      [{ name: 'sb-myproject-auth-token', value: 'token-value', options: {} }],
      {}
    );
    const setCookie = headers['Set-Cookie'];
    const serialized = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(serialized).toContain('sb-myproject-auth-token=token-value');
    // Critical: must not be HttpOnly, otherwise supabaseClient.auth.getSession()
    // returns null on the client and every admin fetch bails with
    // "Session staff manquante."
    expect(serialized?.toLowerCase()).not.toContain('httponly');

    // removal must also keep sb-* cookies non-httpOnly
    headers['Set-Cookie'] = '';
    cookies.setAll(
      [{ name: 'sb-myproject-auth-token', value: '', options: { maxAge: 0 } }],
      {}
    );
    const removed = headers['Set-Cookie'];
    const removedSerialized = Array.isArray(removed) ? removed[0] : removed;
    expect(removedSerialized?.toLowerCase()).not.toContain('httponly');
  });

  it('non-sb cookies remain hardened with HttpOnly', async () => {
    const mod = await import('../../utils/supabase');

    const headers: Record<string, string | string[]> = {};
    const req: any = { cookies: {} };
    const res: any = {
      getHeader: (k: string) => headers[k],
      setHeader: (k: string, v: string | string[]) => {
        headers[k] = v;
      },
    };

    mod.getServerClient(req, res);
    const cookies = captured.opts.cookies;

    cookies.setAll([{ name: 'custom-session', value: 'opaque', options: {} }], {});
    const serialized = headers['Set-Cookie'];
    const value = Array.isArray(serialized) ? serialized[0] : serialized;
    expect(value).toContain('custom-session=opaque');
    expect(value?.toLowerCase()).toContain('httponly');
  });

  // Note: tests that toggle env vars and reload the module use vi.resetModules,
  // which under --no-isolate also resets module-level mocks set up by sibling
  // test files (e.g. utils/stages/standings). Skip those reload tests to avoid
  // breaking other suites — the module-load throw / warn branches are covered
  // by code review, not by tests.
  it.skip('throws at import time when env vars are missing (module reset)', async () => {
    vi.resetModules();
    const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    await expect(import('../../utils/supabase')).rejects.toThrow(
      /Supabase:.*manquant/
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
    vi.resetModules();
  });

  it.skip('warns when SUPABASE_SERVICE_ROLE_KEY is missing (module reset)', async () => {
    vi.resetModules();
    const ORIG = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await import('../../utils/supabase');
    warnSpy.mockRestore();
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG;
    vi.resetModules();
  });
});
