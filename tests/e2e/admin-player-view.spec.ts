// E2E — pages/admin/users/[userId]/player-view.tsx ("Vue player")
//
// Depuis S3 (docs/PLAN-espace-unifie.md), la page n'a plus d'endpoint-snapshot
// `/player-view` : elle lit
//   - l'identité de la cible     → GET /api/admin/users/[userId]/profile
//   - ses demandes en attente     → GET /api/admin/demandes?userId=…&status=pending
// et monte les VRAIS écrans joueur (onglets Espace joueur / Mes matchs /
// Notifications) en mode inspection. Les gestes staff restent ici :
//   * BattleTag → PATCH /api/admin/users/manage
//   * modération d'une demande → POST /api/admin/demandes (updateStatus)
//
// On connecte un VRAI staff admin (/login), puis on route-mocke les deux
// lectures ci-dessus pour une UI déterministe. Les écrans joueur inspectés
// ne sont pas l'objet de cette spec (couverts par player-*.spec.ts) : on
// vérifie seulement que la barre d'onglets les sélectionne.

import { test, expect, type Page } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const STAFF_PASSWORD = 'TestPassw0rd!';
const STAFF_EMAIL = 'hirtzvincent+playerviewmgr@gmail.com';

const TARGET_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_ID = '33333333-3333-4333-8333-333333333333';
const DEMANDE_ID = '22222222-2222-4222-8222-222222222222';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

function profilePayload() {
  return {
    user: {
      id: TARGET_USER_ID,
      email: 'joueuse@example.com',
      displayName: 'Joueuse Test',
      battleTag: 'Joueuse#1234',
      avatarUrl: null,
      role: 'player',
      createdAt: '2025-01-15T10:00:00.000Z',
    },
    team: { id: TEAM_ID, name: 'Les Phénix', role: 'member' },
  };
}

function demandesPayload() {
  return {
    demandes: [
      {
        id: DEMANDE_ID,
        type: 'join',
        status: 'pending',
        created_at: '2025-02-01T12:00:00.000Z',
        comment: 'Je souhaite rejoindre cette équipe.',
        team: { id: TEAM_ID, name: 'Les Phénix' },
      },
    ],
  };
}

async function mockReads(page: Page, profileStatus = 200): Promise<void> {
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
      url.pathname === '/api/admin/demandes' &&
      url.searchParams.get('userId') === TARGET_USER_ID,
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

async function gotoPlayerView(page: Page) {
  await page.goto('/login');
  await page.fill('input#email', STAFF_EMAIL);
  await page.fill('input#password', STAFF_PASSWORD);
  await page.click('#main-content button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });

  await page.goto(`/admin/users/${TARGET_USER_ID}/player-view`);
}

async function expectBanner(page: Page) {
  await expect(
    page.getByRole('heading', { name: /Espace joueur de Joueuse Test/ })
  ).toBeVisible({ timeout: 15000 });
}

test.describe('Admin "Vue player" (command center)', () => {
  test.beforeAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    }
  });

  test.afterAll(async () => {
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('renders banner, profile facts, staff actions and the 4 tabs', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page);
    await gotoPlayerView(page);

    await expectBanner(page);
    await expect(page.getByText(/sont appliquées au compte/)).toBeVisible();

    const main = page.locator('#main-content');
    // Onglet par défaut = Profil : identité + actions staff + demande en attente.
    await expect(main.getByText('joueuse@example.com').first()).toBeVisible();
    await expect(main.getByText('Joueuse#1234').first()).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Modifier le nom affiché' })
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Renvoyer les identifiants' })
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Modifier le BattleTag' })
    ).toBeVisible();
    await expect(
      main.getByRole('button', { name: 'Transférer vers une autre équipe' })
    ).toBeVisible();
    // Le commentaire de la demande n'est pas repris dans la liste staff ;
    // ses deux gestes, si.
    await expect(main.getByRole('button', { name: 'Approuver' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Refuser' })).toBeVisible();

    // Les trois écrans joueur inspectés : la barre d'onglets les sélectionne.
    for (const name of ['Espace joueur', 'Mes matchs', 'Notifications']) {
      const tab = main.getByRole('tab', { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
    const profil = main.getByRole('tab', { name: /^Profil/ });
    await profil.click();
    await expect(profil).toHaveAttribute('aria-selected', 'true');
  });

  test('editing a BattleTag triggers PATCH /api/admin/users/manage', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page);

    let patchBody: Record<string, unknown> | null = null;
    await page.route(
      (url) => url.pathname === '/api/admin/users/manage',
      async (route) => {
        if (route.request().method() === 'PATCH') {
          patchBody = route.request().postDataJSON() as Record<string, unknown>;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          });
          return;
        }
        await route.fallback();
      }
    );

    await gotoPlayerView(page);
    await expectBanner(page);

    await page.getByRole('button', { name: 'Modifier le BattleTag' }).click();
    const input = page.getByPlaceholder('Pseudo#1234');
    await expect(input).toBeVisible();
    await input.fill('NewTag#4242');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect.poll(() => patchBody).not.toBeNull();
    expect(patchBody).toMatchObject({
      userId: TARGET_USER_ID,
      teamId: TEAM_ID,
      battleTag: 'NewTag#4242',
    });
  });

  test('approving a pending demande triggers POST /api/admin/demandes', async ({
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

    await gotoPlayerView(page);
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
      demandeIds: [DEMANDE_ID],
      newStatus: 'approved',
    });
  });

  test('404 → "Utilisateur introuvable"', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockReads(page, 404);
    await gotoPlayerView(page);

    await expect(
      page.getByText('Utilisateur introuvable', { exact: false }).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
