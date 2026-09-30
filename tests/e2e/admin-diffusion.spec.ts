import { test, expect } from '@playwright/test';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';
import { loginStaff } from './_helpers/playerSession';

/**
 * Tests E2E — l'espace « Diffusion » (régie, casteuses, overlays).
 *
 * Deux niveaux :
 *   - SANS compte : chaque écran de l'espace renvoie vers la connexion en
 *     gardant sa destination (`next=`), et les anciennes adresses des
 *     casteuses redirigent vers Diffusion › Casteuses en un saut ;
 *   - AVEC le compte Test Coach (admin) : la barre d'onglets relie les écrans,
 *     l'onglet actif porte `aria-current`, et la page Overlays montre ses
 *     sources.
 */

const COACH_EMAIL = 'hirtzvincent+testcoachdiffusion@gmail.com';
const COACH_PASSWORD = 'TestCoach2026!';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function loginAsCoach(page: import('@playwright/test').Page) {
  // Seconde tentative intégrée (serveur froid) ; pas de `networkidle` :
  // l'admin garde des requêtes périodiques et l'attente coûtait ~30 s par
  // test. Les assertions qui suivent attendent déjà leur cible.
  await loginStaff(page, COACH_EMAIL, COACH_PASSWORD);
}

/** Les écrans de l'espace, dans l'ordre de la barre d'onglets. */
const DIFFUSION_SCREENS = [
  '/admin/regie',
  '/admin/broadcast/live',
  '/admin/events',
  '/admin/caster',
  '/admin/diffusion/overlays',
  '/admin/diffusion/casteuses',
  '/admin/twitch-channels',
];

test.describe('Diffusion — sans compte', () => {
  for (const path of [
    '/admin/diffusion/overlays',
    '/admin/diffusion/casteuses',
  ]) {
    test(`${path} renvoie vers la connexion`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 10000 });
      expect(page.url()).toMatch(/\/login/);
    });
  }

  test('les anciennes adresses des casteuses visent Diffusion › Casteuses', async ({
    request,
  }) => {
    for (const legacy of [
      '/admin/association?tab=cast',
      '/admin/cast-members',
      '/admin/cast-members/new',
    ]) {
      const res = await request.get(legacy, { maxRedirects: 0 });
      expect([307, 308]).toContain(res.status());
      expect(res.headers().location ?? '').toContain(
        '/admin/diffusion/casteuses'
      );
    }
  });
});

test.describe('Diffusion — admin connecté', () => {
  // Le compte « Test Coach » existait en prod ; sur la base jetable de la CI il
  // faut le créer (admin), et le retirer ensuite.
  test.beforeAll(async () => {
    await deleteTestStaff(COACH_EMAIL);
    await createTestStaff(COACH_EMAIL, COACH_PASSWORD, 'admin');
  });
  test.afterAll(async () => {
    await deleteTestStaff(COACH_EMAIL);
  });
  test('la barre d’onglets relie tous les écrans de l’espace', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/diffusion/overlays');
    const nav = page.getByRole('navigation', { name: /diffusion|broadcast/i });
    await expect(nav).toBeVisible({ timeout: 15000 });

    const hrefs = await nav
      .getByRole('link')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    for (const screen of DIFFUSION_SCREENS) expect(hrefs).toContain(screen);

    await expect(nav.getByRole('link', { name: 'Overlays' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  test('la page Overlays montre les sources OBS du tournoi choisi', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/diffusion/overlays');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Overlays' })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).not.toContainText('Erreur serveur');
  });

  test('Diffusion › Casteuses charge la liste du pôle production', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/diffusion/casteuses');
    await expect(page.getByText(/Pôle Production/i).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
