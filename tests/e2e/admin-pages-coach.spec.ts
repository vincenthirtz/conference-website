import { test, expect } from '@playwright/test';

/**
 * Tests de chargement de toutes les pages admin avec le compte Test Coach (admin).
 * Verifie : connexion, chargement, absence d'erreurs, deconnexion.
 */

const COACH_EMAIL = 'hirtzvincent+testcoach@gmail.com';
const COACH_PASSWORD = 'TestCoach2026!';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

/** Helper: login via UI and wait for admin dashboard */
async function loginAsCoach(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('input#email', COACH_EMAIL);
  await page.fill('input#password', COACH_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

/** Helper: check page loaded without fatal errors */
async function expectPageLoaded(page: import('@playwright/test').Page) {
  // No "Erreur serveur" / "500" / crash
  const body = page.locator('body');
  await expect(body).toBeVisible({ timeout: 15000 });

  // Should not be redirected to login (session lost)
  expect(page.url()).not.toContain('/login');

  // Should not be on 403/500 error pages
  expect(page.url()).not.toContain('/403');
  expect(page.url()).not.toContain('/500');

  // No Next.js error overlay
  const errorOverlay = page.locator(
    '#__next-build-error, [data-nextjs-dialog]'
  );
  await expect(errorOverlay).toHaveCount(0);
}

// ─── Connexion ──────────────────────────────────────────────────────

test.describe.serial('Admin pages — Test Coach', () => {
  test('Connexion au dashboard admin', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.goto('/login');
    await page.fill('input#email', COACH_EMAIL);
    await page.fill('input#password', COACH_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });
    await expect(page.locator('body')).toBeVisible();

    // Should display the profile page or dashboard
    expect(page.url()).toMatch(/\/admin/);
  });

  // ─── Dashboard / Profil ─────────────────────────────────────────

  test('Modale profil admin (deep-link /admin?profile=1)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    // Le profil staff n'est plus une page dédiée : c'est une modale globale
    // déclenchée depuis le top-bar admin. Le deep-link `?profile=1` (vers lequel
    // l'ancienne route `/admin/profile` 308-redirige) l'ouvre. Le titre de la
    // modale ("Mon profil") est rendu comme un heading par le composant Modal.
    await page.goto('/admin?profile=1');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('heading', { name: 'Mon profil', exact: true })
    ).toBeVisible({ timeout: 10000 });
    await expectPageLoaded(page);
  });

  // ─── Tournois ───────────────────────────────────────────────────

  test('Page liste tournois (GET /admin/tournaments)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/tournaments');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);

    // Should show tournaments heading or list
    await expect(
      page
        .getByRole('heading')
        .filter({ hasText: /tournoi/i })
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('Page creation tournoi (GET /admin/tournaments/create)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/tournaments/create');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Equipes ────────────────────────────────────────────────────

  test('Page liste equipes (GET /admin/teams)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/teams');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);

    await expect(
      page.getByRole('heading').filter({ hasText: /quipe/i }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('Page creer equipe (GET /admin/teams/new)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/teams/new');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page mon equipe (GET /admin/teams/my)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/teams/my');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Ancienne route ajouter membre equipe redirige vers la liste (GET /admin/teams/add-member)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    // La page autonome a été remplacée par la modale AddMemberModal sur la
    // page d'édition d'équipe : l'ancienne route redirige (308) vers la liste.
    await page.goto('/admin/teams/add-member');
    await page.waitForURL(/\/admin\/teams(\?|$)/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page demandes joueurs (GET /admin/demandes)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/demandes');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Partenaires ────────────────────────────────────────────────

  test('Page liste partenaires (GET /admin/partners)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/partners');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Ancienne route nouveau partenaire ouvre la modale (GET /admin/partners/new)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    // La création se fait dans une modale sur la liste : l'ancienne route
    // redirige (308) vers `?new=1`, qui ouvre la modale.
    await page.goto('/admin/partners/new');
    await page.waitForURL(/\/admin\/partners\?new=1/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  });

  test('Page demandes partenariat (GET /admin/partnership-requests)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/partnership-requests');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Contenu : Annonces ─────────────────────────────────────────

  test('Page liste annonces (GET /admin/communications?tab=announcements)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/communications?tab=announcements');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page nouvelle annonce (GET /admin/announcements/new)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/announcements/new');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Contenu : News ─────────────────────────────────────────────

  test('Page liste news (GET /admin/communications?tab=news)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/communications?tab=news');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page nouvelle news (GET /admin/news/new)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/news/new');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Contenu : Twitch ───────────────────────────────────────────

  test('Page chaines Twitch (GET /admin/twitch-channels)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/twitch-channels');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Ancienne route nouvelle chaine Twitch ouvre la modale (GET /admin/twitch-channels/new)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/twitch-channels/new');
    await page.waitForURL(/\/admin\/twitch-channels\?new=1/, {
      timeout: 10000,
    });
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  });

  // ─── Contenu : Cast members ─────────────────────────────────────

  test('Page liste casteuses (GET /admin/association?tab=cast)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/association?tab=cast');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Ancienne route nouvelle casteuse ouvre la modale (GET /admin/cast-members/new)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/cast-members/new');
    await page.waitForURL(/\/admin\/cast-members\?new=1/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  });

  // ─── Contenu : Commentaires ─────────────────────────────────────

  test('Page commentaires (onglet /admin/moderation?tab=comments)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/moderation?tab=comments');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Adherents ──────────────────────────────────────────────────

  test('Page liste adherents (GET /admin/association?tab=adherents)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/association?tab=adherents');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page nouvel adherent (GET /admin/adherents/new)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/adherents/new');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Logs & Stats ──────────────────────────────────────────────

  test('Page logs staff (GET /admin/logs)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/logs');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page logs emails (GET /admin/email-logs)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/email-logs');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page stats equipes (GET /admin/stats?tab=teams)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/stats?tab=teams');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page stats maps (GET /admin/stats?tab=maps)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/stats?tab=maps');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Configuration ─────────────────────────────────────────────

  test('Page parametres du site (GET /admin/site-settings)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/site-settings');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page gestion utilisateurs (GET /admin/users/manage)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/users/manage');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page creer utilisateur (GET /admin/users/new)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/users/new');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Outils ─────────────────────────────────────────────────────

  test('Page corbeille (GET /admin/recycle-bin)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/recycle-bin');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page simulateur tournoi (GET /admin/tournament-simulator)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/tournament-simulator');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  test('Page templates tournoi (GET /admin/tournament-templates)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    await page.goto('/admin/tournament-templates');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });

  // ─── Auth pages ─────────────────────────────────────────────────

  test('Page forgot password (GET /admin/forgot-password)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // No login needed — public page
    await page.goto('/admin/forgot-password');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/admin/forgot-password');
  });

  test('Page reset password (GET /admin/reset-password)', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await page.goto('/admin/reset-password');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
  });

  // ─── Deconnexion ────────────────────────────────────────────────

  test('Deconnexion fonctionne correctement', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginAsCoach(page);

    // Navigate to logout
    await page.goto('/admin/logout');
    await page.waitForLoadState('networkidle');

    // Should redirect to login after logout
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('Session perdue apres deconnexion — acces admin redirige vers login', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Try accessing admin without being logged in
    await page.goto('/admin/tournaments');

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  // ─── Reconnexion apres deconnexion ──────────────────────────────

  test('Reconnexion fonctionne apres deconnexion', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Login fresh
    await loginAsCoach(page);

    // Should be on admin
    expect(page.url()).toMatch(/\/admin/);
    await expectPageLoaded(page);

    // Navigate to a protected page to confirm session works
    await page.goto('/admin/tournaments');
    await page.waitForLoadState('networkidle');
    await expectPageLoaded(page);
  });
});
