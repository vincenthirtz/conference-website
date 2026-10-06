// tests/unit/staffMfa.test.ts
//
// Double authentification (TOTP) du staff — utils/staffMfa.ts + gardes.
//
// La garantie centrale est ANTI LOCK-OUT : tant que `STAFF_MFA_ENFORCED` n'est
// pas explicitement activée, AUCUNE garde ne refuse quoi que ce soit faute de
// second facteur. Activée, une session `aal1` est refusée sur les routes
// sensibles et redirigée vers /admin/mfa sur les pages ; une session `aal2`
// passe partout.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setRpcResult,
} from './__helpers__/supabaseMock';
import {
  invalidateStaffCache,
  withStaffPage,
  withStaffRoute,
} from '../../utils/staff';
import {
  aalFromAccessToken,
  hasVerifiedTotp,
  isMfaSensitiveGuard,
  isStaffMfaEnforced,
  mfaRequired,
  staffMfaRedirect,
} from '../../utils/staffMfa';
import usersExport from '../../pages/api/admin/users/export';
import teamsExport from '../../pages/api/admin/teams/export';

const USER = 'user-staff';

/** JWT factice (signature non vérifiée ici : GoTrue est mocké). */
let _n = 0;
function jwt(claims: Record<string, unknown>): string {
  _n += 1;
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ ...claims, n: _n })}.sig`;
}

function makeReq(token: string, query: Record<string, string> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${token}` },
    cookies: {},
    query,
    body: {},
  };
}
function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: USER });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: USER,
      email: 'staff@example.test',
      role: 'owner',
      display_name: 'Staff',
      is_active: true,
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ] as any;
  setRpcResult('admin_list_users', { data: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logique pure', () => {
  it('le flag est COUPÉ par défaut et sur toute valeur non explicite', () => {
    expect(isStaffMfaEnforced({})).toBe(false);
    expect(isStaffMfaEnforced({ STAFF_MFA_ENFORCED: '' })).toBe(false);
    expect(isStaffMfaEnforced({ STAFF_MFA_ENFORCED: 'false' })).toBe(false);
    expect(isStaffMfaEnforced({ STAFF_MFA_ENFORCED: 'yes please' })).toBe(
      false
    );
    expect(isStaffMfaEnforced({ STAFF_MFA_ENFORCED: 'true' })).toBe(true);
    expect(isStaffMfaEnforced({ STAFF_MFA_ENFORCED: ' 1 ' })).toBe(true);
    expect(isStaffMfaEnforced({ STAFF_MFA_ENFORCED: 'ON' })).toBe(true);
  });

  it('lit le niveau d’assurance du jeton', () => {
    expect(aalFromAccessToken(jwt({ aal: 'aal2' }))).toBe('aal2');
    expect(aalFromAccessToken(jwt({ aal: 'aal1' }))).toBe('aal1');
    expect(aalFromAccessToken(jwt({ aal: 'aal3' }))).toBeNull();
    expect(aalFromAccessToken('pas-un-jwt')).toBeNull();
    expect(aalFromAccessToken(null)).toBeNull();
  });

  it('aal2 requis SEULEMENT si flag actif ET route sensible ET session aal1', () => {
    expect(mfaRequired({ enforced: false, sensitive: true, aal: 'aal1' })).toBe(
      false
    );
    expect(mfaRequired({ enforced: false, sensitive: true, aal: null })).toBe(
      false
    );
    expect(mfaRequired({ enforced: true, sensitive: false, aal: 'aal1' })).toBe(
      false
    );
    expect(mfaRequired({ enforced: true, sensitive: true, aal: 'aal2' })).toBe(
      false
    );
    expect(mfaRequired({ enforced: true, sensitive: true, aal: 'aal1' })).toBe(
      true
    );
    expect(mfaRequired({ enforced: true, sensitive: true, aal: null })).toBe(
      true
    );
  });

  it('gardes sensibles : owner, manage_tenant, manage_billing, manage_staff', () => {
    expect(isMfaSensitiveGuard('owner')).toBe(true);
    expect(isMfaSensitiveGuard('admin')).toBe(false);
    expect(isMfaSensitiveGuard({ role: 'owner', scope: 'platform' })).toBe(
      true
    );
    expect(isMfaSensitiveGuard({ permission: 'manage_tenant' })).toBe(true);
    expect(isMfaSensitiveGuard({ permission: 'manage_billing' })).toBe(true);
    expect(isMfaSensitiveGuard({ permission: 'manage_staff' })).toBe(true);
    expect(isMfaSensitiveGuard({ permission: 'manage_teams' })).toBe(false);
    expect(isMfaSensitiveGuard({ permission: 'run_checkin' })).toBe(false);
  });

  it('facteur TOTP vérifié', () => {
    expect(hasVerifiedTotp({ factors: [] })).toBe(false);
    expect(
      hasVerifiedTotp({
        factors: [{ factor_type: 'totp', status: 'unverified' }],
      })
    ).toBe(false);
    expect(
      hasVerifiedTotp({
        factors: [{ factor_type: 'totp', status: 'verified' }],
      })
    ).toBe(true);
  });

  it('redirection vers /admin/mfa : next admin conservé, le reste ignoré', () => {
    expect(staffMfaRedirect('/admin/teams?x=1')).toBe(
      '/admin/mfa?next=%2Fadmin%2Fteams%3Fx%3D1'
    );
    expect(staffMfaRedirect('https://evil.test')).toBe('/admin/mfa');
    expect(staffMfaRedirect('/admin/mfa?next=/admin')).toBe('/admin/mfa');
    expect(staffMfaRedirect(undefined)).toBe('/admin/mfa');
  });
});

describe('defineAdminRoute — route sensible (export des comptes, manage_staff)', () => {
  it('flag coupé : une session aal1 passe', async () => {
    const res = makeRes();
    await usersExport(makeReq(jwt({ aal: 'aal1' })), res);
    expect(res.statusCode).toBe(200);
  });

  it('flag actif : une session aal1 est refusée (403 mfa_required)', async () => {
    vi.stubEnv('STAFF_MFA_ENFORCED', 'true');
    const res = makeRes();
    await usersExport(makeReq(jwt({ aal: 'aal1' })), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      reason: 'mfa_required',
    });
  });

  it('flag actif : une session aal2 passe', async () => {
    vi.stubEnv('STAFF_MFA_ENFORCED', 'true');
    const res = makeRes();
    await usersExport(makeReq(jwt({ aal: 'aal2' })), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('withStaffRoute', () => {
  const sensitive = withStaffRoute(async (_req, res) => {
    res.status(200).json({ ok: true });
  }, 'owner');

  it('flag actif + garde sensible + aal1 : 403 MFA_REQUIRED', async () => {
    vi.stubEnv('STAFF_MFA_ENFORCED', 'true');
    const res = makeRes();
    await sensitive(makeReq(jwt({ aal: 'aal1' })), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'MFA_REQUIRED' });
  });

  it('flag coupé + garde sensible + aal1 : passe', async () => {
    const res = makeRes();
    await sensitive(makeReq(jwt({ aal: 'aal1' })), res);
    expect(res.statusCode).toBe(200);
  });

  it('flag actif + garde NON sensible (manage_teams) + aal1 : passe', async () => {
    vi.stubEnv('STAFF_MFA_ENFORCED', 'true');
    const res = makeRes();
    await teamsExport(makeReq(jwt({ aal: 'aal1' })), res);
    expect(res.statusCode).toBe(200);
  });
});

describe('withStaffPage', () => {
  const gssp = withStaffPage('admin');
  const pageCtx = (token: string) =>
    ({
      req: makeReq(token),
      res: makeRes(),
      resolvedUrl: '/admin/teams',
      query: {},
    }) as any;

  it('flag coupé : la page s’affiche même en aal1', async () => {
    const out: any = await gssp(pageCtx(jwt({ aal: 'aal1' })));
    expect(out.props).toBeDefined();
    expect(out.redirect).toBeUndefined();
  });

  it('flag actif + aal1 : redirection vers /admin/mfa avec next', async () => {
    vi.stubEnv('STAFF_MFA_ENFORCED', 'true');
    const out: any = await gssp(pageCtx(jwt({ aal: 'aal1' })));
    expect(out.redirect).toEqual({
      destination: '/admin/mfa?next=%2Fadmin%2Fteams',
      permanent: false,
    });
  });

  it('flag actif + aal2 : la page s’affiche', async () => {
    vi.stubEnv('STAFF_MFA_ENFORCED', 'true');
    const out: any = await gssp(pageCtx(jwt({ aal: 'aal2' })));
    expect(out.props).toBeDefined();
  });
});
