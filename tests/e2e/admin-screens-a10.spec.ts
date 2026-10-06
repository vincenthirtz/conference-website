// E2E — écrans admin jusqu'ici sans spec (lot A10) : un test par écran,
// « s'affiche + action principale ».
//
//   quick-bracket · leagues · disputes · free-players · map-pool · ratings ·
//   tenants/new
//
// Auth = vraie connexion admin ; TOUTES les routes API lues ou écrites par ces
// écrans sont mockées (cf. _helpers/adminScreenMocks) : rien n'est créé ni
// supprimé en base. Billing, webhooks et support ont leur propre fichier.

import { test, expect } from '@playwright/test';
import {
  loginStaff,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';
import {
  STAFF_PASSWORD,
  E2E_TENANT_ID,
  captureJson,
  dismissNextDevOverlay,
  mockActiveTenant,
  mockJson,
} from './_helpers/adminScreenMocks';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const ADMIN_EMAIL = perWorker('hirtzvincent+e2e-screens-a10@gmail.com');
const ID = '66666666-6666-4666-8666-666666666666';

test.describe('Admin — écrans sans spec (lot A10)', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
    await createTestStaff(ADMIN_EMAIL, STAFF_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockActiveTenant(page);
  });

  test('quick-bracket : génère un bracket depuis une liste collée', async ({
    page,
  }) => {
    const create = await captureJson(page, '/api/admin/quick-bracket', {
      tournamentId: ID,
      slug: 'e2e-quick',
    });

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/quick-bracket');
    await expect(
      page.getByRole('heading', { name: 'Quick bracket', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await page.locator('#qb-name').fill('Coupe E2E');
    await page.locator('#qb-participants').fill('Alpha\nBravo\nCharlie');
    await page.getByRole('button', { name: 'Générer le bracket' }).click();

    await expect.poll(() => create.requests.length).toBe(1);
    expect(create.requests[0].body).toMatchObject({
      name: 'Coupe E2E',
      format: 'single_elim',
    });
    expect(create.requests[0].body.participants).toContain('Bravo');
    await page.waitForURL(/\/tournament\/e2e-quick\/bracket/, {
      timeout: 15000,
    });
  });

  test('leagues : liste puis création d’une ligue', async ({ page }) => {
    const league = {
      id: ID,
      tenant_id: E2E_TENANT_ID,
      name: 'Ligue existante',
      slug: 'ligue-existante',
      description: null,
      game: 'overwatch',
      status: 'active',
      start_date: null,
      end_date: null,
      points_table: {},
      is_public: true,
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    };
    await mockJson(page, '/api/admin/leagues', { leagues: [league] });
    const create = await captureJson(page, '/api/admin/leagues', {
      ...league,
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Saison E2E',
      slug: 'saison-e2e',
    });
    // Fiche ouverte après création : lue, jamais écrite.
    await mockJson(page, /^\/api\/admin\/leagues\/[^/]+(\/.*)?$/, {
      ...league,
      standings: [],
      tournaments: [],
    });

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/leagues');
    await expect(
      page.getByRole('heading', { name: 'Ligues & saisons', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);
    await expect(page.getByText('Ligue existante').first()).toBeVisible();

    await page.getByRole('button', { name: 'Nouvelle ligue' }).click();
    await page.locator('#league-name').fill('Saison E2E');
    await page.getByRole('button', { name: 'Créer la ligue' }).click();

    await expect.poll(() => create.requests.length).toBe(1);
    expect(create.requests[0].body).toMatchObject({
      name: 'Saison E2E',
      slug: 'saison-e2e',
    });
    await page.waitForURL(/\/admin\/leagues\/77777777-/, { timeout: 15000 });
  });

  test('disputes : liste les litiges et filtre sur « Breached »', async ({
    page,
  }) => {
    const seen: string[] = [];
    await page.route(
      (url) => url.pathname === '/api/admin/disputes',
      async (route) => {
        const status = new URL(route.request().url()).searchParams.get(
          'status'
        );
        seen.push(status ?? 'all');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            disputes: [
              {
                matchId: ID,
                tournament: {
                  id: ID,
                  name: 'Tournoi E2E',
                  slug: 'tournoi-e2e',
                },
                team1: { id: 't1', name: 'Équipe Rouge' },
                team2: { id: 't2', name: 'Équipe Bleue' },
                disputeReason: 'Score contesté',
                disputeOpenedAt: '2026-10-06T08:00:00.000Z',
                escalationPingedAt: null,
                ageMinutes: 240,
                slaMinutes: 120,
                classification: 'breached',
              },
            ],
            counts: { total: 1, breached: 1, approaching: 0, fresh: 0 },
            total: 1,
          }),
        });
      }
    );
    await mockJson(page, '/api/admin/tournaments', {
      tournaments: [],
      total: 0,
    });

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/disputes');
    await page.waitForURL(/\/admin\/moderation\?.*tab=disputes/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole('heading', { name: 'Disputes ouvertes' })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);
    await expect(page.getByText('Équipe Rouge').first()).toBeVisible();

    await page
      .getByRole('button', { name: /Breached/ })
      .first()
      .click();
    await expect.poll(() => seen.includes('breached')).toBe(true);
  });

  test('free-players : retire une fiche après confirmation', async ({
    page,
  }) => {
    await mockJson(page, '/api/admin/free-players', {
      items: [
        {
          id: ID,
          source: 'web',
          name: 'Joueuse Libre E2E',
          roles: ['support'],
          level: 'Diamant',
          availability: 'Soirs',
          note: null,
          contactEmail: null,
          contactDiscord: null,
          discordUsername: 'libre_e2e',
          markedAt: '2026-10-01T00:00:00.000Z',
          expiresAt: null,
        },
      ],
    });
    const remove = await captureJson(
      page,
      '/api/admin/free-players',
      { success: true, willReturn: false },
      { method: 'DELETE' }
    );

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/free-players');
    await expect(
      page.getByRole('heading', { name: 'Joueuses libres', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);
    await expect(page.getByText('Joueuse Libre E2E').first()).toBeVisible();

    await page
      .getByRole('button', { name: 'Retirer' })
      .filter({ visible: true })
      .first()
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Retirer' })
      .click();

    await expect.poll(() => remove.requests.length).toBe(1);
    expect(new URL(remove.requests[0].url).searchParams.get('id')).toBe(ID);
    await expect(page.getByText('Fiche retirée.')).toBeVisible();
  });

  test('map-pool : ajoute une map au jeu affiché', async ({ page }) => {
    await mockJson(page, '/api/admin/map-pool', {
      game: 'overwatch',
      maps: [
        {
          id: ID,
          tenant_id: E2E_TENANT_ID,
          game: 'overwatch',
          map_name: 'Lijiang Tower',
          map_type: 'control',
          image_url: null,
          enabled: true,
          order_index: 1,
        },
      ],
    });
    const add = await captureJson(page, '/api/admin/map-pool', {
      map: { id: 'new' },
    });

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/map-pool');
    await expect(
      page.getByRole('heading', { name: 'Map pool', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);
    await expect(page.getByText('Lijiang Tower')).toBeVisible();

    await page.getByRole('button', { name: '+ Ajouter une map' }).click();
    await page.locator('#map-pool-name').fill('Busan');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

    await expect.poll(() => add.requests.length).toBe(1);
    expect(add.requests[0].body).toMatchObject({
      map_name: 'Busan',
      enabled: true,
    });
    await expect(page.getByText('Map ajoutée')).toBeVisible();
  });

  test('ratings : reconstruit les ratings après confirmation', async ({
    page,
  }) => {
    await mockJson(page, '/api/players/leaderboard', { players: [] });
    await mockJson(page, '/api/admin/ratings/coverage', {
      finished: 10,
      rated: 8,
      unrated: 2,
      samples: [],
    });
    const rebuild = await captureJson(page, '/api/admin/ratings/rebuild', {
      players: 12,
      matches: 10,
    });

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/ratings');
    await expect(
      page.getByRole('heading', { name: 'Ratings joueurs', level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await page
      .getByRole('button', { name: 'Reconstruire les ratings' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Reconstruire' })
      .click();

    await expect.poll(() => rebuild.requests.length).toBe(1);
    await expect(
      page.getByText('Ratings reconstruits : 12 joueurs, 10 matchs.')
    ).toBeVisible();
  });

  test('tenants/new : redirige vers la modale et crée un espace', async ({
    page,
  }) => {
    await mockJson(page, '/api/admin/tenants', { tenants: [] });
    const create = await captureJson(
      page,
      '/api/admin/tenants',
      { tenant: { id: ID, slug: 'espace-e2e', name: 'Espace E2E' } },
      { status: 201 }
    );

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/tenants/new');
    await page.waitForURL(/\/admin\/tenants\?new=1/, { timeout: 15000 });
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await page.getByTestId('tenant-name-input').fill('Espace E2E');
    await expect(page.getByTestId('tenant-slug-input')).toHaveValue(
      'espace-e2e'
    );
    await page.getByTestId('tenant-create-submit').click();

    await expect.poll(() => create.requests.length).toBe(1);
    expect(create.requests[0].body).toMatchObject({
      slug: 'espace-e2e',
      name: 'Espace E2E',
    });
  });
});
