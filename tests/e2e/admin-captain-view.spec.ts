// E2E — pages/admin/users/[userId]/captain-view.tsx ("Vue capitaine")
//
// Réécrite en S3 (docs/PLAN-espace-unifie.md) : plus d'endpoint-snapshot
// `/captain-view` ni d'onglets. La page lit
//   - l'identité de la cible          → GET /api/admin/users/[userId]/profile
//   - l'équipe qu'elle gère (?as=)     → GET /api/admin/teams/my?as=<userId>
//   - les demandes de join en attente  → GET /api/admin/demandes?teamId=…
// et monte le VRAI écran capitaine (PlayerManageTeamScreen) en inspection.
// Ce qui reste propre au staff, et que cette spec vérifie :
//   - promouvoir un membre → POST /api/admin/users/[memberId]/actions
//   - modérer une demande  → POST /api/admin/demandes (updateStatus)
//
// Staff admin RÉEL connecté par /login ; les trois lectures sont route-mockées
// pour une UI déterministe. L'écran capitaine inspecté (ses propres appels
// /api/player/*) n'est pas l'objet de la spec — cf. manage-team.spec.ts.

import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const STAFF_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+captainviewmgr@gmail.com';

const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER_USER_ID = '44444444-4444-4444-8444-444444444444';
const JOIN_DEMANDE_ID = '55555555-5555-4555-8555-555555555555';
const TEAM_ID = '66666666-6666-4666-8666-666666666666';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

function profilePayload() {
  return {
    user: {
      id: TARGET_USER_ID,
      email: 'capitaine@example.com',
      displayName: 'Capitaine Test',
      battleTag: 'Cap#1234',
      avatarUrl: null,
      role: 'player',
      createdAt: '2025-01-15T10:00:00.000Z',
    },
    team: { id: TEAM_ID, name: 'Les Corbeaux', role: 'captain' },
  };
}

function managedPayload(captain = true) {
  if (!captain) {
    return { team: null, members: [], isCaptain: false, isManager: false };
  }
  return {
    team: { id: TEAM_ID, name: 'Les Corbeaux' },
    members: [
      {
        id: 'tm-1',
        user_id: TARGET_USER_ID,
        display_name: 'Capitaine Test',
        battle_tag: 'Cap#1234',
        role: 'captain',
        is_captain: true,
      },
      {
        id: 'tm-2',
        user_id: MEMBER_USER_ID,
        display_name: 'Coéquipière',
        battle_tag: 'Mate#5678',
        role: 'member',
        is_captain: false,
      },
    ],
    isCaptain: true,
    isManager: false,
  };
}

function demandesPayload() {
  return {
    demandes: [
      {
        id: JOIN_DEMANDE_ID,
        type: 'join',
        status: 'pending',
        created_at: '2025-02-01T12:00:00.000Z',
        comment: 'Je veux rejoindre votre équipe.',
        payload: null,
      },
    ],
  };
}

async function mockReads(
  page: Page,
  opts: { profileStatus?: number; captain?: boolean } = {}
): Promise<void> {
  const { profileStatus = 200, captain = true } = opts;
  await page.route(
    (url) => url.pathname === `/api/admin/users/${TARGET_USER_ID}/profile`,
    (route) =>
      route.fulfill({
        status: profileStatus,
        contentType: 'application/json',
        body: JSON.stringify(
          profileStatus === 200
            ? profilePayload()
            : { error: 'Utilisateur introuvable' }
        ),
      })
  );
  await page.route(
    (url) =>
      url.pathname === '/api/admin/teams/my' &&
      url.searchParams.get('as') === TARGET_USER_ID,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(managedPayload(captain)),
      })
  );
  await page.route(
    (url) =>
      url.pathname === '/api/admin/demandes' &&
      url.searchParams.get('teamId') === TEAM_ID,
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(demandesPayload()),
          })
        : route.fallback()
  );
}

async function gotoCaptainView(page: Page) {
  await page.goto('/login');
  await page.fill('input#email', STAFF_EMAIL);
  await page.fill('input#password', STAFF_PASSWORD);
  await page.click('#main-content button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });

  await page.goto(`/admin/users/${TARGET_USER_ID}/captain-view`);
}

async function expectBanner(page: Page) {
  await expect(
    page.getByRole('heading', { name: /Espace capitaine de Capitaine Test/ })
  ).toBeVisible({ timeout: 15000 });
}

test.describe('Admin "Vue capitaine" (command center)', () => {
  test.beforeAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    }
  });

  test.afterAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('renders banner, team badge, promotable members and join requests', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page);
    await gotoCaptainView(page);

    await expectBanner(page);
    const main = page.locator('#main-content');
    await expect(main.getByText('Les Corbeaux').first()).toBeVisible();
    // La capitaine elle-même n'est pas promouvable ; la coéquipière l'est.
    await expect(
      main.getByRole('button', { name: 'Coéquipière' })
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Capitaine Test' })
    ).toHaveCount(0);
    // Demande de join en attente, avec ses deux gestes.
    // Le commentaire de la demande n'est pas repris dans la liste staff ;
    // ses deux gestes, si.
    await expect(main.getByRole('button', { name: 'Approuver' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Refuser' })).toBeVisible();
  });

  test('promoting a member triggers POST /api/admin/users/[id]/actions', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page);

    let actionBody: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === `/api/admin/users/${MEMBER_USER_ID}/actions`,
      async (route) => {
        actionBody = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    );

    await gotoCaptainView(page);
    await expectBanner(page);

    await page
      .locator('#main-content')
      .getByRole('button', { name: 'Coéquipière' })
      .click();
    const dialog = page.getByRole('dialog', {
      name: /Promouvoir ce membre capitaine/,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Promouvoir capitaine' }).click();

    await expect.poll(() => actionBody).not.toBeNull();
    expect(actionBody).toMatchObject({ action: 'assign_captain' });
  });

  test('approving a join request triggers POST /api/admin/demandes', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page);

    let demandeBody: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === '/api/admin/demandes',
      async (route) => {
        if (route.request().method() === 'POST') {
          demandeBody = route.request().postDataJSON() as Record<
            string,
            unknown
          >;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, updatedCount: 1 }),
          });
          return;
        }
        await route.fallback();
      }
    );

    await gotoCaptainView(page);
    await expectBanner(page);

    await page
      .locator('#main-content')
      .getByRole('button', { name: 'Approuver' })
      .click();
    const dialog = page.getByRole('dialog', {
      name: /Approuver cette demande/,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Approuver' }).click();

    await expect.poll(() => demandeBody).not.toBeNull();
    expect(demandeBody).toMatchObject({
      action: 'updateStatus',
      demandeIds: [JOIN_DEMANDE_ID],
      newStatus: 'approved',
    });
  });

  test('not-a-captain → "Pas de capitanat" empty state', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page, { captain: false });
    await gotoCaptainView(page);

    await expectBanner(page);
    await expect(
      page.getByText('Pas de capitanat', { exact: false }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test('404 → "Utilisateur introuvable"', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page, { profileStatus: 404 });
    await gotoCaptainView(page);

    await expect(
      page.getByText('Utilisateur introuvable', { exact: false }).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
