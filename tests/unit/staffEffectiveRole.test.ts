// tests/unit/staffEffectiveRole.test.ts
//
// Rôle EFFECTIF sur le tenant actif = max(rôle global, `tenant_staff.role`).
//
// Le problème réglé ici : l'onboarding self-service crée un propriétaire
// d'espace avec `tenant_staff.role = 'owner'` et un rôle global `caster` (le
// plus bas, volontairement — on ne fabrique pas d'administrateur de la
// plateforme). Comme le back-office ne gardait QUE sur le rôle global, cette
// personne ne pouvait rien administrer chez elle : ni créer un tournoi, ni
// ouvrir sa page de facturation pour souscrire. Elle était enfermée dans son
// propre espace.
//
// Le contrat vérifié :
//   - le rôle de tenant ÉLÈVE, et seulement sur le tenant actif ;
//   - il ne RÉTROGRADE jamais (un admin global reste admin partout) ;
//   - les routes de PLATEFORME (données d'association) se gardent sur le rôle
//     global : l'élévation ne les ouvre pas.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StaffMember } from '../../types/staff';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import {
  invalidateStaffCache,
  requireStaffRoleFromRequest,
  StaffUnauthorizedError,
} from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeStaffRow(role: string): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'owner@example.test',
    role: role as StaffMember['role'],
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeReq(cookies: Record<string, string> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: 'Bearer t' },
    cookies,
    query: {},
    body: {},
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json() {
      return this;
    },
    setHeader() {},
  };
}

/** Deux espaces ; le staff est owner de A et absent de B. */
function seedOwnerOfA(globalRole = 'caster', tenantRole = 'owner') {
  store.staff = [makeStaffRow(globalRole)] as any;
  store.tenants = [
    { id: TENANT_A, slug: 'alpha', is_active: true },
    { id: TENANT_B, slug: 'beta', is_active: true },
  ] as any;
  store.tenant_staff = [
    { tenant_id: TENANT_A, staff_id: 'staff-1', role: tenantRole },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-1' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('rôle effectif sur le tenant actif', () => {
  it('un caster global, owner de son espace, passe une garde owner', async () => {
    seedOwnerOfA();
    const ctx = await requireStaffRoleFromRequest(
      makeReq(),
      makeRes(),
      'owner'
    );
    expect(ctx.tenantId).toBe(TENANT_A);
    expect(ctx.role).toBe('owner');
    // Le rôle global, lui, n'a pas bougé.
    expect(ctx.globalRole).toBe('caster');
  });

  it('sans rôle de tenant, le caster reste un caster', async () => {
    store.staff = [makeStaffRow('caster')] as any;
    store.tenants = [{ id: TENANT_A, slug: 'alpha', is_active: true }] as any;
    store.tenant_staff = [] as any;

    await expect(
      requireStaffRoleFromRequest(makeReq(), makeRes(), 'admin')
    ).rejects.toBeInstanceOf(StaffUnauthorizedError);
  });

  it('le rôle de tenant n’élève que sur CE tenant', async () => {
    // Owner de A uniquement. Le cookie désigne B, auquel le staff n'a pas
    // accès : la résolution retombe sur A et l'élévation le suit.
    seedOwnerOfA();
    const ctx = await requireStaffRoleFromRequest(
      makeReq({ staff_active_tenant_id: TENANT_B }),
      makeRes(),
      'owner'
    );
    expect(ctx.tenantId).toBe(TENANT_A);
  });

  it('ne rétrograde jamais : admin global + tenant caster reste admin', async () => {
    seedOwnerOfA('admin', 'caster');
    const ctx = await requireStaffRoleFromRequest(
      makeReq(),
      makeRes(),
      'admin'
    );
    expect(ctx.role).toBe('admin');
    expect(ctx.globalRole).toBe('admin');
  });

  it('portée plateforme : l’élévation par tenant n’ouvre pas les données d’association', async () => {
    // C'est la contrepartie du correctif. Sans cette portée, le propriétaire
    // d'un espace tiers lirait les adhérents, partenaires et campagnes email
    // de l'association — des données qui n'appartiennent à aucun tenant.
    seedOwnerOfA();
    await expect(
      requireStaffRoleFromRequest(makeReq(), makeRes(), 'admin', {
        scope: 'platform',
      })
    ).rejects.toBeInstanceOf(StaffUnauthorizedError);
  });

  it('portée plateforme : un admin global passe', async () => {
    seedOwnerOfA('admin', 'owner');
    const ctx = await requireStaffRoleFromRequest(
      makeReq(),
      makeRes(),
      'admin',
      { scope: 'platform' }
    );
    expect(ctx.globalRole).toBe('admin');
  });
});
