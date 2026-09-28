// Matrice de permissions des routes déclaratives — lot L3
// (docs/PLAN-industrialisation-admin.md).
//
// Chaque route `defineAdminRoute` expose sa garde par méthode
// (`handler.adminRoute`). Ce test les découvre toutes et vérifie, pour chaque
// méthode × chaque rôle staff qui NE DOIT PAS passer la garde, que l'appel est
// refusé (401/403) AVANT le handler — sans écrire un test par route.
//
// Une route migrée est couverte le jour de sa migration, sans rien ajouter.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { StaffMember } from '../../types/staff';
import type { StaffRole } from '../../types/admin';
import {
  store,
  resetSupabaseMock,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache, type StaffGuard } from '../../utils/staff';
import { invalidateTenantAccessCache } from '../../utils/adminTenants';
import { STAFF_ROLES, hasAtLeastRole } from '../../utils/staffRoles';
import { roleHasStaffPermission } from '../../utils/staffPermissions';
import type { AdminRouteHandler } from '../../utils/admin/defineAdminRoute';

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.ts$/.test(name) ? [rel] : [];
  });
}

/** Routes dont la source délègue à un module ou appelle defineAdminRoute. */
const ROUTE_FILES = walk('pages/api/admin').filter((rel) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return src.includes('defineAdminRoute(') || src.includes('@/features/admin/');
});

/** Le rôle passe-t-il la garde ? (miroir de `resolveGuard`, portée tenant) */
function passes(role: StaffRole, guard: StaffGuard): boolean {
  if (typeof guard === 'string') return hasAtLeastRole(role, guard);
  if ('permission' in guard)
    return roleHasStaffPermission(role, guard.permission);
  return hasAtLeastRole(role, guard.role);
}

function staffRow(role: StaffRole): StaffMember {
  return {
    id: 'staff-matrix',
    auth_user_id: 'user-matrix',
    email: 'm@m.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let n = 0;
function makeReq(method: string): any {
  n += 1;
  return {
    method,
    headers: { host: 'h', authorization: `Bearer t-matrix-${n}` },
    cookies: {},
    query: {},
    body: {},
  };
}

function makeRes(): any {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, unknown>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: unknown) {
      this.headers[k] = v;
    },
  };
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  invalidateTenantAccessCache();
  setAuthUser({ id: 'user-matrix' });
});

describe('matrice de permissions des routes admin déclaratives', () => {
  it('au moins une route est déclarative (sinon la matrice est vide)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  for (const rel of ROUTE_FILES) {
    it(`${rel} refuse chaque rôle hors garde, avant le handler`, async () => {
      const mod = await import(path.join(ROOT, rel));
      const route = mod.default as AdminRouteHandler;
      expect(
        route.adminRoute,
        `${rel} doit exporter une route defineAdminRoute`
      ).toBeDefined();

      for (const [method, meta] of Object.entries(route.adminRoute.methods)) {
        for (const role of STAFF_ROLES) {
          if (passes(role, meta!.guard)) continue;
          invalidateStaffCache();
          store.staff = [staffRow(role)] as any;
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
          const res = makeRes();
          await route(makeReq(method), res);
          spy.mockRestore();
          expect(
            [401, 403],
            `${rel} ${method} laisse passer le rôle ${role} (garde ${JSON.stringify(meta!.guard)})`
          ).toContain(res.statusCode);
        }
      }
    });
  }
});
