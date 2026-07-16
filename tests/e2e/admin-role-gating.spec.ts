import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

/**
 * Role-gating regression guard (audit admin #9).
 *
 * `withStaffPage(requiredRole)` (utils/staff.ts) is the single SSR security
 * boundary for admin pages. Role hierarchy (utils/staff.ts STAFF_ROLE_RANK):
 *
 *   owner (3) > admin (2) > manager (1) > caster (0)
 *
 * A staff member whose role rank is BELOW the page's requiredRole must be
 * redirected to /403. A staff member at-or-above the requiredRole must reach
 * the page. This spec pins that behaviour so that an accidental downgrade of a
 * gate (e.g. withStaffPage('admin') silently becoming 'caster') is caught.
 *
 * Pages under test, with their real requiredRole (verified against pages/admin):
 *   - /admin/onboarding      -> manager (pages/admin/onboarding/index.tsx)
 *   - /admin/users/manage    -> admin   (pages/admin/users/manage.tsx)
 *   - /admin/site-settings   -> admin   (pages/admin/site-settings/index.tsx)
 *   - /admin/tenants         -> manager (pages/admin/tenants/index.tsx)
 *
 * NB (Lot C): the former owner-gated /admin/tenant-requests page was folded
 * into the merged /admin/onboarding hub as its owner-only "Demandes de tenant"
 * tab. The old route is now a 308 shim, so its SSR gate is the manager-gated
 * host; owner-gating for that tab is enforced client-side (tab hidden) + at the
 * API level (/api/admin/tenant-requests stays owner-only). Hence the sample
 * below uses the manager-gated host instead.
 */

const TEST_PASSWORD = 'TestPassw0rd!';

const CASTER_EMAIL = 'hirtzvincent+e2e-rolegate-caster@gmail.com';
const ADMIN_EMAIL = 'hirtzvincent+e2e-rolegate-admin@gmail.com';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

// Le rôle staff 'manager' a été retiré : hiérarchie caster < admin < owner.
// Les pages autrefois gatées 'manager' (onboarding, tenants) le sont désormais
// 'admin' comme les autres. On ne teste donc que deux niveaux effectifs ici :
// caster (bloqué partout) vs admin (autorisé partout).
type Gate = { path: string; requiredRole: 'owner' | 'admin' };

const GATES: Gate[] = [
  { path: '/admin/onboarding', requiredRole: 'admin' },
  { path: '/admin/users/manage', requiredRole: 'admin' },
  { path: '/admin/site-settings', requiredRole: 'admin' },
  { path: '/admin/tenants', requiredRole: 'admin' },
];

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('input#email', email);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  // Caster is the lowest staff role and still lands on /admin (index is
  // caster-gated), so every staff role reaches /admin after login.
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

/**
 * Navigate to an admin page and assert it was blocked: withStaffPage redirects
 * insufficient roles to /403. We assert on the resolved URL rather than page
 * content so the test does not depend on the /403 page markup.
 */
async function expectBlocked(page: Page, path: string) {
  await page.goto(path);
  await page.waitForURL(/\/403/, { timeout: 10000 });
  expect(page.url()).toContain('/403');
}

/**
 * Navigate to an admin page and assert access was granted: we should remain on
 * the requested path and never bounce to /403 or /admin/login.
 */
async function expectAllowed(page: Page, path: string) {
  await page.goto(path);
  // Give SSR redirects a chance to fire, then assert we stayed put.
  await page.waitForLoadState('networkidle');
  expect(page.url()).toContain(path);
  expect(page.url()).not.toContain('/403');
  expect(page.url()).not.toContain('/login');
}

test.describe.serial('Admin role-gating (withStaffPage)', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(CASTER_EMAIL);
    await deleteTestStaff(ADMIN_EMAIL);
    await createTestStaff(CASTER_EMAIL, TEST_PASSWORD, 'caster');
    await createTestStaff(ADMIN_EMAIL, TEST_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(CASTER_EMAIL);
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('caster (rank 0) is redirected to /403 on every elevated page', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await login(page, CASTER_EMAIL);

    // caster est sous tous les gates (admin/owner).
    for (const gate of GATES) {
      await expectBlocked(page, gate.path);
    }
  });

  test('admin reaches every admin gate (et bloqué sur owner-only le cas échéant)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await login(page, ADMIN_EMAIL);

    for (const gate of GATES) {
      if (gate.requiredRole === 'owner') {
        await expectBlocked(page, gate.path);
      } else {
        await expectAllowed(page, gate.path);
      }
    }
  });
});
