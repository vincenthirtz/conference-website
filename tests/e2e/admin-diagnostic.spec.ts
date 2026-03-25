/**
 * Tests E2E — Diagnostic admin (rôle admin)
 *
 * Diagnostique les problèmes signalés par un admin réel :
 *  1. Pages qui restent en chargement sans rien afficher
 *  2. Navigation lente entre les pages (comme si la connexion était mauvaise)
 *
 * Stratégie auth : un seul login UI dans beforeAll, storageState partagé
 * entre tous les tests pour éviter le rate-limiting Supabase.
 */
import { test, expect, chromium, type Page, type BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import os from 'os';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

/* -----------------------------------------------------------
 * Configuration
 * ---------------------------------------------------------*/

const TS = Date.now();
const STAFF_EMAIL = `e2e-diag-admin-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!Diag42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Seuils de performance (ms)
const THRESHOLDS = {
  SSR_PAGE_LOAD: 5000,
  CLIENT_DATA_FETCH: 8000,
  NAVIGATION: 6000,
  SPINNER_DISAPPEAR: 10000,
};

const skip = !supabaseTestClient;

/* -----------------------------------------------------------
 * Auth partagée — un seul login UI pour tous les tests
 * ---------------------------------------------------------*/

const authFile = path.join(os.tmpdir(), `admin-diag-auth-${TS}.json`);
let staffToken: string | null = null;

/* -----------------------------------------------------------
 * Pages admin critiques à tester
 * ---------------------------------------------------------*/

const ADMIN_PAGES = [
  { path: '/admin', label: 'Dashboard / Profil' },
  { path: '/admin/tournaments', label: 'Liste des tournois' },
  { path: '/admin/teams', label: 'Liste des équipes' },
  { path: '/admin/news', label: 'Liste des actualités' },
  { path: '/admin/partners', label: 'Liste des partenaires' },
  { path: '/admin/announcements', label: 'Annonces' },
  { path: '/admin/cast-members', label: 'Membres du cast' },
  { path: '/admin/adherents', label: 'Adhérents' },
  { path: '/admin/logs', label: 'Logs staff' },
  { path: '/admin/users/manage', label: 'Gestion utilisateurs' },
];

/* -----------------------------------------------------------
 * Setup / Teardown
 * ---------------------------------------------------------*/

test.describe.serial('Diagnostic admin – chargement & navigation', () => {
  test.skip(skip, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // 1. Créer le staff de test
    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');

    // 2. Obtenir un token API (pour les tests API purs)
    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await client.auth.signInWithPassword({
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
      });
      staffToken = data.session?.access_token ?? null;
    }

    // 3. Login UI unique → sauvegarder le storageState (cookies + localStorage)
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/admin/login`);
    await page.waitForSelector('input#email', { state: 'visible', timeout: 10000 });
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Sauvegarder les cookies et localStorage dans un fichier
    await context.storageState({ path: authFile });

    await browser.close();
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(STAFF_EMAIL);
  });

  /** Créer un context authentifié à partir du storageState sauvegardé */
  async function newAuthPage(browser: import('@playwright/test').Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    return { context, page };
  }

  /* ---------------------------------------------------------
   * Test 1 : Login admin fonctionne et redirige correctement
   * -------------------------------------------------------*/
  test('Login admin et redirection vers le dashboard', async ({ browser }) => {
    // Ce test vérifie le login UI — on utilise un context frais (pas le storageState)
    const context = await browser.newContext();
    const page = await context.newPage();

    const start = Date.now();

    await page.goto(`${BASE_URL}/admin/login`);
    await page.waitForSelector('input#email', { state: 'visible', timeout: 10000 });
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15000 });
    const loginDuration = Date.now() - start;

    console.log(`⏱ Login + redirection : ${loginDuration}ms`);
    expect(loginDuration).toBeLessThan(THRESHOLDS.SSR_PAGE_LOAD * 2);
    await expect(page).toHaveURL(/\/admin/);

    await context.close();
  });

  /* ---------------------------------------------------------
   * Test 2 : Chaque page admin se charge sans rester bloquée
   * -------------------------------------------------------*/
  test('Toutes les pages admin se chargent sans blocage', async ({ browser }) => {
    const { context, page } = await newAuthPage(browser);

    const results: {
      label: string;
      path: string;
      durationMs: number;
      status: number | null;
      timedOut: boolean;
      failedRequests: string[];
      spinnerStuck: boolean;
    }[] = [];

    for (const { path: pagePath, label } of ADMIN_PAGES) {
      const failedRequests: string[] = [];

      const onResponse = (res: import('@playwright/test').Response) => {
        if (res.status() >= 400) {
          failedRequests.push(`${res.status()} ${res.url()}`);
        }
      };

      page.on('response', onResponse);

      const start = Date.now();
      let status: number | null = null;
      let timedOut = false;

      try {
        const response = await page.goto(pagePath, { timeout: 15000, waitUntil: 'domcontentloaded' });
        status = response?.status() ?? null;
      } catch {
        timedOut = true;
      }

      const durationMs = Date.now() - start;

      // Vérifier le spinner
      let spinnerStuck = false;
      if (!timedOut) {
        await page.waitForTimeout(500);
        const spinnerVisible = await page
          .locator('.animate-spin')
          .first()
          .isVisible()
          .catch(() => false);

        if (spinnerVisible) {
          try {
            await expect(page.locator('.animate-spin').first()).not.toBeVisible({
              timeout: THRESHOLDS.SPINNER_DISAPPEAR,
            });
          } catch {
            spinnerStuck = true;
          }
        }
      }

      page.off('response', onResponse);

      results.push({ label, path: pagePath, durationMs, status, timedOut, failedRequests, spinnerStuck });
    }

    // Rapport
    console.log('\n📊 Résultat chargement des pages admin :');
    const failures: string[] = [];

    for (const r of results) {
      const icons: string[] = [];
      if (r.timedOut) icons.push('🔴 TIMEOUT');
      else if (r.status && r.status >= 400) icons.push(`🔴 HTTP ${r.status}`);
      else if (r.durationMs > THRESHOLDS.SSR_PAGE_LOAD) icons.push('🟡 LENT');
      else icons.push('🟢 OK');

      if (r.spinnerStuck) icons.push('🔴 SPINNER BLOQUÉ');

      console.log(`  ${r.label} (${r.path}): ${r.durationMs}ms ${icons.join(' ')}`);

      if (r.failedRequests.length > 0) {
        console.log(`    ⚠ Requêtes échouées: ${r.failedRequests.join(', ')}`);
      }

      if (r.timedOut) failures.push(`${r.label}: TIMEOUT`);
      if (r.status && r.status >= 500) failures.push(`${r.label}: HTTP ${r.status}`);
      if (r.spinnerStuck) failures.push(`${r.label}: spinner bloqué`);
    }

    expect(failures, `Pages en échec:\n${failures.join('\n')}`).toHaveLength(0);

    await context.close();
  });

  /* ---------------------------------------------------------
   * Test 3 : Navigation entre pages – pas de lenteur excessive
   * -------------------------------------------------------*/
  test('Navigation séquentielle entre pages admin (performance)', async ({ browser }) => {
    const { context, page } = await newAuthPage(browser);

    const navigationResults: { from: string; to: string; durationMs: number }[] = [];
    const pagesToVisit = ADMIN_PAGES.slice(0, 6);

    for (let i = 0; i < pagesToVisit.length - 1; i++) {
      const from = pagesToVisit[i];
      const to = pagesToVisit[i + 1];

      await page.goto(from.path, { waitUntil: 'networkidle' });

      const start = Date.now();
      await page.goto(to.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const duration = Date.now() - start;
      navigationResults.push({ from: from.path, to: to.path, durationMs: duration });
    }

    console.log('\n📊 Résumé navigation séquentielle :');
    for (const r of navigationResults) {
      const status = r.durationMs > THRESHOLDS.NAVIGATION ? '🔴 LENT' : '🟢 OK';
      console.log(`  ${r.from} → ${r.to} : ${r.durationMs}ms ${status}`);
    }

    const avg =
      navigationResults.reduce((sum, r) => sum + r.durationMs, 0) / navigationResults.length;
    console.log(`  Moyenne : ${Math.round(avg)}ms`);

    for (const r of navigationResults) {
      expect(
        r.durationMs,
        `Navigation ${r.from} → ${r.to} trop lente (${r.durationMs}ms)`
      ).toBeLessThan(THRESHOLDS.NAVIGATION);
    }

    await context.close();
  });

  /* ---------------------------------------------------------
   * Test 4 : API admin – temps de réponse des endpoints critiques
   * -------------------------------------------------------*/
  test('Temps de réponse des API admin critiques', async ({ request }) => {
    expect(staffToken).toBeTruthy();

    const endpoints = [
      { path: '/api/admin/tournaments?limit=10', label: 'Tournois' },
      { path: '/api/admin/teams?limit=10', label: 'Équipes' },
      { path: '/api/admin/news?limit=10', label: 'News' },
      { path: '/api/admin/partners?limit=10', label: 'Partenaires' },
      { path: '/api/admin/announcements?limit=10', label: 'Annonces' },
      { path: '/api/admin/cast-members?limit=10', label: 'Cast members' },
      { path: '/api/admin/logs?limit=10', label: 'Staff logs' },
    ];

    console.log('\n📊 Temps de réponse API admin :');

    for (const ep of endpoints) {
      const start = Date.now();
      let status = 0;
      let ok = false;

      try {
        const res = await request.get(`${BASE_URL}${ep.path}`, {
          headers: { Authorization: `Bearer ${staffToken}` },
          timeout: THRESHOLDS.CLIENT_DATA_FETCH,
        });
        status = res.status();
        ok = res.ok();
      } catch {
        status = 0;
      }

      const duration = Date.now() - start;
      const statusIcon = ok ? '🟢' : status === 0 ? '🔴 TIMEOUT' : `🟡 ${status}`;
      console.log(`  ${ep.label}: ${duration}ms ${statusIcon}`);

      expect(status, `${ep.label} a timeout ou échoué`).toBeGreaterThan(0);
      expect(duration, `${ep.label} trop lent (${duration}ms)`).toBeLessThan(
        THRESHOLDS.CLIENT_DATA_FETCH
      );
    }
  });

  /* ---------------------------------------------------------
   * Test 5 : Détection de pages bloquées en état "loading"
   * -------------------------------------------------------*/
  test('Aucune page admin ne reste bloquée en état de chargement', async ({ browser }) => {
    const { context, page } = await newAuthPage(browser);

    const stuckPages: string[] = [];

    for (const { path: pagePath, label } of ADMIN_PAGES) {
      await page.goto(pagePath, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(500);

      const spinnerVisible = await page
        .locator('.animate-spin')
        .first()
        .isVisible()
        .catch(() => false);

      if (spinnerVisible) {
        try {
          await expect(page.locator('.animate-spin').first()).not.toBeVisible({
            timeout: THRESHOLDS.SPINNER_DISAPPEAR,
          });
        } catch {
          stuckPages.push(`${label} (${pagePath})`);
          console.log(`🔴 BLOQUÉ : ${label} (${pagePath}) - spinner toujours visible`);
        }
      }

      const loadingText = await page
        .getByText('Chargement...', { exact: false })
        .first()
        .isVisible()
        .catch(() => false);

      if (loadingText) {
        try {
          await expect(
            page.getByText('Chargement...', { exact: false }).first()
          ).not.toBeVisible({ timeout: THRESHOLDS.SPINNER_DISAPPEAR });
        } catch {
          if (!stuckPages.includes(`${label} (${pagePath})`)) {
            stuckPages.push(`${label} (${pagePath})`);
            console.log(
              `🔴 BLOQUÉ : ${label} (${pagePath}) - texte "Chargement..." toujours visible`
            );
          }
        }
      }
    }

    if (stuckPages.length > 0) {
      console.log(`\n🔴 Pages bloquées en chargement : ${stuckPages.join(', ')}`);
    } else {
      console.log('\n🟢 Aucune page bloquée en chargement');
    }

    expect(stuckPages, `Pages bloquées : ${stuckPages.join(', ')}`).toHaveLength(0);

    await context.close();
  });

  /* ---------------------------------------------------------
   * Test 6 : Requêtes réseau – détecter les requêtes lentes ou bloquées
   * -------------------------------------------------------*/
  test('Pas de requêtes réseau bloquées ou excessivement lentes', async ({ browser }) => {
    const { context, page } = await newAuthPage(browser);

    const slowRequests: { url: string; durationMs: number }[] = [];
    const failedRequests: { url: string; status: number }[] = [];
    const pendingRequests = new Map<string, number>();

    page.on('request', (req) => {
      if (req.url().includes('/api/')) {
        pendingRequests.set(req.url(), Date.now());
      }
    });

    page.on('response', (res) => {
      const url = res.url();
      const startTime = pendingRequests.get(url);

      if (startTime) {
        const duration = Date.now() - startTime;
        pendingRequests.delete(url);

        if (duration > 3000) {
          slowRequests.push({ url, durationMs: duration });
        }
        if (res.status() >= 400) {
          failedRequests.push({ url, status: res.status() });
        }
      }
    });

    const criticalPages = ['/admin/tournaments', '/admin/teams', '/admin/news'];

    for (const pagePath of criticalPages) {
      pendingRequests.clear();
      await page.goto(pagePath, { waitUntil: 'networkidle', timeout: 15000 });
    }

    if (slowRequests.length > 0) {
      console.log('\n🟡 Requêtes lentes (>3s) :');
      for (const r of slowRequests) {
        console.log(`  ${r.url} : ${r.durationMs}ms`);
      }
    }

    if (failedRequests.length > 0) {
      console.log('\n🔴 Requêtes échouées :');
      for (const r of failedRequests) {
        console.log(`  ${r.url} : ${r.status}`);
      }
    }

    const criticalFailures = failedRequests.filter((r) => r.status >= 500);
    expect(
      criticalFailures,
      `Requêtes 5xx : ${criticalFailures.map((r) => r.url).join(', ')}`
    ).toHaveLength(0);

    await context.close();
  });

  /* ---------------------------------------------------------
   * Test 7 : Session persistence – la session ne se perd pas entre les pages
   * -------------------------------------------------------*/
  test('La session admin persiste entre les navigations', async ({ browser }) => {
    const { context, page } = await newAuthPage(browser);

    const pagesToCheck = [
      '/admin',
      '/admin/tournaments',
      '/admin/teams',
      '/admin/news',
      '/admin/partners',
      '/admin',
    ];

    for (const pagePath of pagesToCheck) {
      await page.goto(pagePath, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const currentUrl = page.url();
      expect(
        currentUrl,
        `Redirigé vers login après navigation vers ${pagePath}`
      ).not.toContain('/admin/login');
      expect(currentUrl).not.toContain('/403');
    }

    console.log('🟢 Session persistante sur toutes les pages');

    await context.close();
  });

  /* ---------------------------------------------------------
   * Test 8 : Vérifier si les requêtes se bloquent mutuellement
   * -------------------------------------------------------*/
  test('Les requêtes API ne se bloquent pas mutuellement', async ({ browser }) => {
    const { context, page } = await newAuthPage(browser);

    const apiTimings: { url: string; start: number; end: number }[] = [];

    page.on('request', (req) => {
      if (req.url().includes('/api/admin/')) {
        apiTimings.push({ url: req.url(), start: Date.now(), end: 0 });
      }
    });

    page.on('response', (res) => {
      if (res.url().includes('/api/admin/')) {
        const timing = apiTimings.find((t) => t.url === res.url() && t.end === 0);
        if (timing) timing.end = Date.now();
      }
    });

    await page.goto('/admin/tournaments', { waitUntil: 'networkidle', timeout: 15000 });

    const completedTimings = apiTimings.filter((t) => t.end > 0);
    if (completedTimings.length > 0) {
      console.log('\n📊 Timings des requêtes API sur /admin/tournaments :');
      for (const t of completedTimings) {
        const duration = t.end - t.start;
        const urlShort = new URL(t.url).pathname + new URL(t.url).search;
        console.log(`  ${urlShort}: ${duration}ms`);
      }

      for (const t of completedTimings) {
        const duration = t.end - t.start;
        expect(
          duration,
          `Requête ${t.url} trop lente (${duration}ms)`
        ).toBeLessThan(THRESHOLDS.CLIENT_DATA_FETCH);
      }
    }

    await context.close();
  });
});
