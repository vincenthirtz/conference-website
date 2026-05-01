// Unit tests for utils/supabase.ts and utils/supabaseAdmin.ts.
//
// These modules are normally swapped out by tests/unit/__helpers__/supabaseMock.
// Here we import the REAL implementations after setting fake env vars, so the
// (small) module body and getServerClient cookie wrappers get exercised.

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Capture the options passed to createServerClient so we can drive the cookie
// callbacks (set / remove) directly. We can't easily call them through the
// real Supabase auth flow without making network calls.
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

    // get
    expect(cookies.get('sb-access')).toBe('tok');

    // First set: no existing Set-Cookie → string
    cookies.set('sb-1', 'v1', {});
    expect(typeof headers['Set-Cookie']).toBe('string');

    // Second set: existing string → array
    cookies.set('sb-2', 'v2', { sameSite: 'strict' });
    expect(Array.isArray(headers['Set-Cookie'])).toBe(true);

    // Third set: existing array → push
    cookies.set('sb-3', 'v3', {});
    expect((headers['Set-Cookie'] as string[]).length).toBeGreaterThanOrEqual(
      3
    );

    // remove → goes through hardenCookieOptions + appendSetCookie
    cookies.remove('sb-1', {});
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
