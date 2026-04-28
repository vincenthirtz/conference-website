/**
 * Tests E2E — Diagnostic admin (role admin)
 *
 * Diagnostique les problemes signales par un admin reel :
 *  1. Pages qui restent en chargement sans rien afficher
 *  2. Navigation lente entre les pages
 *
 * Strategie auth : un seul login UI dans beforeAll, storageState partage
 * entre tous les tests pour eviter le rate-limiting Supabase.
 */
import { test, expect, chromium, type Page } from '@playwright/test';
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

/** Seuils de performance (ms) */
const THRESHOLDS = {
  SSR_PAGE_LOAD: 5_000,
  API_RESPONSE: 8_000,
  NAVIGATION: 6_000,
  LOADING_INDICATOR: 10_000,
  SLOW_REQUEST: 3_000,
};

const skip = !supabaseTestClient;

/* -----------------------------------------------------------
 * Auth partagee
 * ---------------------------------------------------------*/

const authFile = path.join(os.tmpdir(), `admin-diag-auth-${TS}.json`);
let staffToken: string | null = null;

/* -----------------------------------------------------------
 * Pages et endpoints admin
 * ---------------------------------------------------------*/

const ADMIN_PAGES = [
  { path: '/admin', label: 'Dashboard / Profil' },
  { path: '/admin/tournaments', label: 'Tournois' },
  { path: '/admin/teams', label: 'Equipes' },
  { path: '/admin/news', label: 'Actualites' },
  { path: '/admin/partners', label: 'Partenaires' },
  { path: '/admin/announcements', label: 'Annonces' },
  { path: '/admin/cast-members', label: 'Cast' },
  { path: '/admin/adherents', label: 'Adherents' },
  { path: '/admin/logs', label: 'Logs staff' },
  { path: '/admin/users/manage', label: 'Utilisateurs' },
];

const SECONDARY_PAGES = [
  { path: '/admin/email-logs', label: 'Logs email' },
  { path: '/admin/recycle-bin', label: 'Corbeille' },
  { path: '/admin/site-settings', label: 'Parametres du site' },
  { path: '/admin/partnership-requests', label: 'Demandes partenariat' },
  { path: '/admin/comments', label: 'Commentaires' },
  { path: '/admin/stats/teams', label: 'Stats equipes' },
  { path: '/admin/stats/maps', label: 'Stats maps' },
];

const API_ENDPOINTS = [
  { path: '/api/admin/tournaments?limit=10', label: 'Tournois' },
  { path: '/api/admin/teams?limit=10', label: 'Equipes' },
  { path: '/api/admin/news?limit=10', label: 'News' },
  { path: '/api/admin/partners?limit=10', label: 'Partenaires' },
  { path: '/api/admin/announcements?limit=10', label: 'Annonces' },
  { path: '/api/admin/cast-members?limit=10', label: 'Cast members' },
  { path: '/api/admin/logs?limit=10', label: 'Staff logs' },
];

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

async function withAuthPage(
  browser: import('@playwright/test').Browser,
  fn: (page: Page) => Promise<void>
) {
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

async function assertNoStuckLoading(page: Page) {
  await page.waitForTimeout(500);

  const spinnerVisible = await page
    .locator('.animate-spin')
    .first()
    .isVisible()
    .catch(() => false);
  if (spinnerVisible) {
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({
      timeout: THRESHOLDS.LOADING_INDICATOR,
    });
  }

  const loadingTextVisible = await page
    .getByText('Chargement...', { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  if (loadingTextVisible) {
    await expect(
      page.getByText('Chargement...', { exact: false }).first()
    ).not.toBeVisible({ timeout: THRESHOLDS.LOADING_INDICATOR });
  }
}

/**
 * Nettoie toutes les donnees de test creees par ce fichier :
 * staff_logs, staff, auth users correspondant au pattern e2e-diag-admin-*@test.local
 */
async function cleanupTestData() {
  if (!supabaseTestClient) return;

  const { data } = await supabaseTestClient.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  const users = (data as any)?.users as
    | { id: string; email?: string }[]
    | undefined;
  const testUsers =
    users?.filter(
      (u) => u.email && /^e2e-diag-admin-\d+@test\.local$/.test(u.email)
    ) ?? [];

  for (const user of testUsers) {
    // Recuperer l'id staff pour nettoyer les logs
    const { data: staffRow } = await supabaseTestClient
      .from('staff')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (staffRow) {
      await supabaseTestClient
        .from('staff_logs')
        .delete()
        .eq('staff_id', staffRow.id);
      await supabaseTestClient.from('staff').delete().eq('id', staffRow.id);
    }

    await supabaseTestClient.auth.admin.deleteUser(user.id);
  }
}

/** Helper pour les appels API authentifies */
async function apiGet(
  request: import('@playwright/test').APIRequestContext,
  endpoint: string
) {
  return request.get(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
    timeout: THRESHOLDS.API_RESPONSE,
  });
}

/* -----------------------------------------------------------
 * Setup / Teardown
 * ---------------------------------------------------------*/

test.describe.serial('Diagnostic admin', () => {
  test.skip(skip, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Nettoyage preventif : supprimer les restes d'un run precedent qui aurait crashe
    await cleanupTestData();

    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');

    if (supabaseUrl && supabaseAnonKey) {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await client.auth.signInWithPassword({
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
      });
      staffToken = data.session?.access_token ?? null;
    }

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/admin/login`);
    await page.waitForSelector('input#email', {
      state: 'visible',
      timeout: 10_000,
    });
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await context.storageState({ path: authFile });
    await browser.close();
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await cleanupTestData();
  });

  /* =========================================================
   * SECTION 1 : Chargement & session
   * =======================================================*/

  test('Login admin et redirection vers le dashboard', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const start = Date.now();
    await page.goto(`${BASE_URL}/admin/login`);
    await page.waitForSelector('input#email', {
      state: 'visible',
      timeout: 10_000,
    });
    await page.fill('input#email', STAFF_EMAIL);
    await page.fill('input#password', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 15_000 });

    const duration = Date.now() - start;
    console.log(`Login + redirection : ${duration}ms`);
    expect(duration).toBeLessThan(THRESHOLDS.SSR_PAGE_LOAD * 2);
    await expect(page).toHaveURL(/\/admin/);

    await context.close();
  });

  test('Toutes les pages admin se chargent sans blocage', async ({
    browser,
  }) => {
    await withAuthPage(browser, async (page) => {
      type PageResult = {
        label: string;
        path: string;
        durationMs: number;
        httpStatus: number | null;
        timedOut: boolean;
        redirectedToLogin: boolean;
        stuckLoading: boolean;
        failedApiRequests: string[];
      };

      const results: PageResult[] = [];

      for (const { path: pagePath, label } of ADMIN_PAGES) {
        const failedApiRequests: string[] = [];
        const onResponse = (res: import('@playwright/test').Response) => {
          if (res.url().includes('/api/') && res.status() >= 400) {
            failedApiRequests.push(
              `${res.status()} ${new URL(res.url()).pathname}`
            );
          }
        };
        page.on('response', onResponse);

        const start = Date.now();
        let httpStatus: number | null = null;
        let timedOut = false;
        try {
          const response = await page.goto(pagePath, {
            timeout: 15_000,
            waitUntil: 'domcontentloaded',
          });
          httpStatus = response?.status() ?? null;
        } catch {
          timedOut = true;
        }
        const durationMs = Date.now() - start;

        const redirectedToLogin =
          page.url().includes('/admin/login') || page.url().includes('/403');

        let stuckLoading = false;
        if (!timedOut && !redirectedToLogin) {
          try {
            await assertNoStuckLoading(page);
          } catch {
            stuckLoading = true;
          }
        }

        page.off('response', onResponse);
        results.push({
          label,
          path: pagePath,
          durationMs,
          httpStatus,
          timedOut,
          redirectedToLogin,
          stuckLoading,
          failedApiRequests,
        });
      }

      console.log('\nChargement des pages admin :');
      const failures: string[] = [];

      for (const r of results) {
        const flags: string[] = [];
        if (r.timedOut) flags.push('TIMEOUT');
        if (r.httpStatus && r.httpStatus >= 500)
          flags.push(`HTTP ${r.httpStatus}`);
        if (r.redirectedToLogin) flags.push('SESSION PERDUE');
        if (r.stuckLoading) flags.push('SPINNER BLOQUE');
        if (r.durationMs > THRESHOLDS.SSR_PAGE_LOAD && !r.timedOut)
          flags.push('LENT');

        const status = flags.length === 0 ? 'OK' : flags.join(', ');
        console.log(`  ${r.label} (${r.path}): ${r.durationMs}ms [${status}]`);

        if (r.failedApiRequests.length > 0) {
          console.log(
            `    Requetes echouees: ${r.failedApiRequests.join(', ')}`
          );
        }

        if (r.timedOut) failures.push(`${r.label}: timeout`);
        if (r.httpStatus && r.httpStatus >= 500)
          failures.push(`${r.label}: HTTP ${r.httpStatus}`);
        if (r.redirectedToLogin) failures.push(`${r.label}: session perdue`);
        if (r.stuckLoading) failures.push(`${r.label}: spinner bloque`);
      }

      expect(failures, `Pages en echec:\n${failures.join('\n')}`).toHaveLength(
        0
      );
    });
  });

  test('Pages secondaires accessibles sans erreur', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      const failures: string[] = [];

      console.log('\nPages secondaires :');
      for (const { path: pagePath, label } of SECONDARY_PAGES) {
        let httpStatus: number | null = null;
        let timedOut = false;

        try {
          const response = await page.goto(pagePath, {
            timeout: 15_000,
            waitUntil: 'domcontentloaded',
          });
          httpStatus = response?.status() ?? null;
        } catch {
          timedOut = true;
        }

        const redirected =
          page.url().includes('/admin/login') || page.url().includes('/403');
        const flags: string[] = [];
        if (timedOut) flags.push('TIMEOUT');
        if (httpStatus && httpStatus >= 500) flags.push(`HTTP ${httpStatus}`);
        if (redirected) flags.push('SESSION PERDUE');

        const status = flags.length === 0 ? 'OK' : flags.join(', ');
        console.log(`  ${label} (${pagePath}): [${status}]`);

        if (timedOut) failures.push(`${label}: timeout`);
        if (httpStatus && httpStatus >= 500)
          failures.push(`${label}: HTTP ${httpStatus}`);
        if (redirected) failures.push(`${label}: session perdue`);
      }

      expect(failures, `Pages en echec:\n${failures.join('\n')}`).toHaveLength(
        0
      );
    });
  });

  test('Session survivra a un refresh de page (F5)', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      // Charger une page admin
      await page.goto('/admin/tournaments', {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
      expect(page.url()).not.toContain('/admin/login');

      // Rafraichir la page (simule F5)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });

      // Toujours sur la meme page, pas de redirect
      expect(page.url()).toContain('/admin/tournaments');
      expect(page.url()).not.toContain('/admin/login');

      // Le contenu se charge correctement
      await assertNoStuckLoading(page);
      console.log('Session survit au refresh');
    });
  });

  /* =========================================================
   * SECTION 2 : Performance
   * =======================================================*/

  test('Navigation entre pages admin (performance)', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      const results: { from: string; to: string; durationMs: number }[] = [];

      for (let i = 0; i < ADMIN_PAGES.length - 1; i++) {
        const from = ADMIN_PAGES[i];
        const to = ADMIN_PAGES[i + 1];

        await page.goto(from.path, { waitUntil: 'networkidle' });

        const start = Date.now();
        await page.goto(to.path, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        });
        await page
          .waitForLoadState('networkidle', { timeout: 10_000 })
          .catch(() => {});
        const duration = Date.now() - start;

        results.push({ from: from.path, to: to.path, durationMs: duration });
      }

      console.log('\nNavigation sequentielle :');
      for (const r of results) {
        const flag = r.durationMs > THRESHOLDS.NAVIGATION ? 'LENT' : 'OK';
        console.log(`  ${r.from} -> ${r.to} : ${r.durationMs}ms [${flag}]`);
      }

      const avg =
        results.reduce((s, r) => s + r.durationMs, 0) / results.length;
      console.log(`  Moyenne : ${Math.round(avg)}ms`);

      for (const r of results) {
        expect(
          r.durationMs,
          `${r.from} -> ${r.to} trop lent (${r.durationMs}ms)`
        ).toBeLessThan(THRESHOLDS.NAVIGATION);
      }
    });
  });

  test('Navigation rapide (clics successifs sans attendre)', async ({
    browser,
  }) => {
    await withAuthPage(browser, async (page) => {
      // Simuler un admin qui clique rapidement entre pages sans attendre le chargement
      await page.goto('/admin', { waitUntil: 'networkidle', timeout: 15_000 });

      const pages = [
        '/admin/tournaments',
        '/admin/teams',
        '/admin/news',
        '/admin/partners',
        '/admin/announcements',
      ];
      const start = Date.now();

      for (const pagePath of pages) {
        // Navigation sans attendre networkidle (comme un clic rapide)
        await page.goto(pagePath, { waitUntil: 'commit', timeout: 15_000 });
      }

      // Attendre que la derniere page se charge completement
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      const totalDuration = Date.now() - start;

      // Verifier qu'on est bien sur la derniere page et pas sur /login
      expect(page.url()).toContain(pages[pages.length - 1]);
      expect(page.url()).not.toContain('/admin/login');

      // Pas de crash : la page a du contenu
      await assertNoStuckLoading(page);

      console.log(
        `Navigation rapide (${pages.length} pages) : ${totalDuration}ms`
      );
    });
  });

  /* =========================================================
   * SECTION 3 : API
   * =======================================================*/

  test('Temps de reponse des API admin', async ({ request }) => {
    expect(staffToken, 'Token API manquant').toBeTruthy();

    console.log('\nTemps de reponse API :');

    for (const ep of API_ENDPOINTS) {
      const start = Date.now();
      let status = 0;
      let ok = false;

      try {
        const res = await apiGet(request, ep.path);
        status = res.status();
        ok = res.ok();
      } catch {
        status = 0;
      }

      const duration = Date.now() - start;
      const flag = ok ? 'OK' : status === 0 ? 'TIMEOUT' : `HTTP ${status}`;
      console.log(`  ${ep.label}: ${duration}ms [${flag}]`);

      expect(status, `${ep.label} timeout ou echoue`).toBeGreaterThan(0);
      expect(duration, `${ep.label} trop lent (${duration}ms)`).toBeLessThan(
        THRESHOLDS.API_RESPONSE
      );
    }
  });

  test('API protegees sans token renvoient 401', async ({ request }) => {
    const protectedEndpoints = [
      '/api/admin/tournaments',
      '/api/admin/teams',
      '/api/admin/news',
      '/api/admin/me',
      '/api/admin/logs',
    ];

    console.log('\nProtection API (sans token) :');

    for (const ep of protectedEndpoints) {
      const res = await request.get(`${BASE_URL}${ep}`, { timeout: 5_000 });
      const label = ep.replace('/api/admin/', '');
      console.log(`  ${label}: ${res.status()}`);
      expect(res.status(), `${ep} accessible sans auth`).toBe(401);
    }
  });

  test('API pagination fonctionne correctement', async ({ request }) => {
    expect(staffToken, 'Token API manquant').toBeTruthy();

    // Tester la pagination sur l'endpoint tournois
    const page1 = await apiGet(
      request,
      '/api/admin/tournaments?limit=2&offset=0&includeTotal=1'
    );
    expect(page1.ok()).toBe(true);

    const data1 = await page1.json();
    expect(data1).toHaveProperty('tournaments');
    expect(data1).toHaveProperty('total');

    // Si assez de donnees, verifier page 2
    if (data1.total > 2) {
      const page2 = await apiGet(
        request,
        '/api/admin/tournaments?limit=2&offset=2&includeTotal=1'
      );
      expect(page2.ok()).toBe(true);

      const data2 = await page2.json();
      expect(data2.tournaments).toBeDefined();

      // Les resultats doivent etre differents
      if (data1.tournaments.length > 0 && data2.tournaments.length > 0) {
        expect(data1.tournaments[0].id).not.toBe(data2.tournaments[0].id);
      }
    }

    console.log(
      `Pagination tournois : total=${data1.total}, page1=${data1.tournaments.length} items`
    );
  });

  test('API filtrage par recherche fonctionne', async ({ request }) => {
    expect(staffToken, 'Token API manquant').toBeTruthy();

    // Recherche avec un terme improbable -> 0 resultats
    const res = await apiGet(
      request,
      '/api/admin/teams?search=zzz_no_match_zzz&limit=10'
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.teams).toHaveLength(0);

    // Recherche sans filtre -> au moins 0 resultats (pas d'erreur)
    const resAll = await apiGet(request, '/api/admin/teams?limit=5');
    expect(resAll.ok()).toBe(true);
    const dataAll = await resAll.json();
    expect(Array.isArray(dataAll.teams)).toBe(true);

    console.log(
      `Filtrage equipes : recherche vide=${dataAll.teams.length} resultats, recherche invalide=0 resultats`
    );
  });

  /* =========================================================
   * SECTION 4 : Reseau & monitoring
   * =======================================================*/

  test('Pas de requetes reseau bloquees ou lentes', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      type RequestTiming = {
        id: number;
        url: string;
        start: number;
        end: number;
        status: number;
      };
      let nextId = 0;
      const timings: RequestTiming[] = [];

      page.on('request', (req) => {
        if (!req.url().includes('/api/')) return;
        timings.push({
          id: nextId++,
          url: req.url(),
          start: Date.now(),
          end: 0,
          status: 0,
        });
      });

      page.on('response', (res) => {
        if (!res.url().includes('/api/')) return;
        for (const entry of timings) {
          if (entry.url === res.url() && entry.end === 0) {
            entry.end = Date.now();
            entry.status = res.status();
            break;
          }
        }
      });

      const criticalPages = [
        '/admin/tournaments',
        '/admin/teams',
        '/admin/news',
        '/admin/logs',
      ];
      for (const pagePath of criticalPages) {
        await page.goto(pagePath, {
          waitUntil: 'networkidle',
          timeout: 15_000,
        });
      }

      const completed = timings.filter((t) => t.end > 0);
      const slow = completed.filter(
        (t) => t.end - t.start > THRESHOLDS.SLOW_REQUEST
      );
      const serverErrors = completed.filter((t) => t.status >= 500);

      if (completed.length > 0) {
        console.log(`\nRequetes API (${completed.length} total) :`);
        for (const t of completed) {
          const duration = t.end - t.start;
          const urlShort = new URL(t.url).pathname;
          const flags: string[] = [];
          if (duration > THRESHOLDS.SLOW_REQUEST) flags.push('LENT');
          if (t.status >= 500) flags.push(`HTTP ${t.status}`);
          if (t.status >= 400 && t.status < 500) flags.push(`${t.status}`);
          const flag = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
          console.log(`  ${urlShort}: ${duration}ms${flag}`);
        }
      }

      if (slow.length > 0) {
        console.log(
          `\n${slow.length} requete(s) lente(s) (>${THRESHOLDS.SLOW_REQUEST}ms)`
        );
      }

      expect(
        serverErrors,
        `Requetes 5xx : ${serverErrors.map((r) => new URL(r.url).pathname).join(', ')}`
      ).toHaveLength(0);
    });
  });

  /* =========================================================
   * SECTION 5 : Interactions UI
   * =======================================================*/

  test('Recherche sur la page equipes fonctionne', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      await page.goto('/admin/teams', {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
      await assertNoStuckLoading(page);

      // Trouver le champ de recherche et taper un terme
      const searchInput = page.locator('input[type="text"]').first();
      await expect(searchInput).toBeVisible({ timeout: 5_000 });

      await searchInput.fill('zzz_no_match_zzz');

      // Soumettre la recherche (Enter ou bouton)
      await searchInput.press('Enter');
      await page
        .waitForLoadState('networkidle', { timeout: 10_000 })
        .catch(() => {});

      // Verifier que la page ne crash pas et affiche un etat coherent
      await assertNoStuckLoading(page);
      expect(page.url()).toContain('/admin/teams');

      console.log('Recherche equipes : OK');
    });
  });

  test('Pagination UI sur la page tournois', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      await page.goto('/admin/tournaments', {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
      await assertNoStuckLoading(page);

      // Verifier la presence d'un indicateur de total
      const body = await page.textContent('body');
      // La page affiche "X tournois" ou "Aucun tournoi"
      const hasTournamentInfo =
        body?.includes('tournoi') || body?.includes('Aucun');
      expect(hasTournamentInfo, "Pas d'info sur le nombre de tournois").toBe(
        true
      );

      // Si un bouton "Suivant" ou pagination existe, verifier qu'il est cliquable
      const nextButton = page.getByText('Suivant', { exact: false });
      const hasNext = await nextButton.isVisible().catch(() => false);

      if (hasNext) {
        const isDisabled = await nextButton.isDisabled().catch(() => true);
        if (!isDisabled) {
          await nextButton.click();
          await page
            .waitForLoadState('networkidle', { timeout: 10_000 })
            .catch(() => {});
          await assertNoStuckLoading(page);
          console.log('Pagination tournois : page 2 OK');
        } else {
          console.log(
            'Pagination tournois : bouton Suivant desactive (pas assez de donnees)'
          );
        }
      } else {
        console.log('Pagination tournois : pas de bouton Suivant visible');
      }
    });
  });

  test('Filtres sur la page partenaires', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      await page.goto('/admin/partners', {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
      await assertNoStuckLoading(page);

      // Trouver un select/filtre de categorie ou status
      const selects = page.locator('select');
      const selectCount = await selects.count();

      if (selectCount > 0) {
        // Changer la valeur du premier select
        const firstSelect = selects.first();
        const options = await firstSelect.locator('option').allTextContents();

        if (options.length > 1) {
          // Selectionner la deuxieme option (premiere = "Tous")
          await firstSelect.selectOption({ index: 1 });
          await page
            .waitForLoadState('networkidle', { timeout: 10_000 })
            .catch(() => {});
          await assertNoStuckLoading(page);
          console.log(`Filtre partenaires : option "${options[1]}" OK`);
        }
      } else {
        console.log('Filtre partenaires : pas de select visible');
      }

      expect(page.url()).toContain('/admin/partners');
    });
  });

  test('Page profil admin permet de voir ses infos', async ({ browser }) => {
    await withAuthPage(browser, async (page) => {
      await page.goto('/admin', { waitUntil: 'networkidle', timeout: 15_000 });
      await assertNoStuckLoading(page);

      const body = await page.textContent('body');

      // La page profil doit afficher le role ou le nom
      const hasProfileInfo =
        body?.includes('admin') ||
        body?.includes('Admin') ||
        body?.includes(STAFF_EMAIL) ||
        body?.includes('Test admin');
      expect(
        hasProfileInfo,
        'Aucune info de profil visible sur le dashboard'
      ).toBe(true);

      console.log('Profil admin : infos visibles');
    });
  });

  /* =========================================================
   * SECTION 6 : Gestion d'erreurs
   * =======================================================*/

  test('API invalide renvoie une erreur propre, pas un crash', async ({
    request,
  }) => {
    expect(staffToken, 'Token API manquant').toBeTruthy();

    // ID inexistant
    const res = await apiGet(
      request,
      '/api/admin/teams/00000000-0000-0000-0000-000000000000'
    );
    // Doit renvoyer 404 ou 200 avec null, pas 500
    expect(res.status(), "L'API crash sur un ID inexistant").not.toBe(500);

    // Methode invalide sur un endpoint GET-only
    const resBadMethod = await request.delete(
      `${BASE_URL}/api/admin/tournaments`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        timeout: 5_000,
      }
    );
    expect(resBadMethod.status()).toBeGreaterThanOrEqual(400);
    expect(
      resBadMethod.status(),
      "L'API crash sur une methode invalide"
    ).not.toBe(500);

    console.log('Gestion erreurs API : OK');
  });

  test("Pages admin affichent un message d'erreur, pas un ecran blanc", async ({
    browser,
  }) => {
    await withAuthPage(browser, async (page) => {
      // Page avec un ID inexistant
      const response = await page.goto(
        '/admin/tournament/00000000-0000-0000-0000-000000000000',
        {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        }
      );

      // La page ne doit pas etre un ecran blanc
      const body = await page.textContent('body');
      const hasContent = body && body.trim().length > 50;
      expect(hasContent, 'Page vide / ecran blanc sur un ID inexistant').toBe(
        true
      );

      // Pas de 500 server error
      const status = response?.status() ?? 0;
      expect(status, 'La page a crash avec un 500').not.toBe(500);

      console.log(`Page tournoi inexistant : HTTP ${status}, contenu present`);
    });
  });

  test('Token expire renvoie 401, pas 500', async ({ request }) => {
    const fakeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

    const res = await request.get(`${BASE_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
      timeout: 5_000,
    });

    expect(res.status()).toBe(401);
    console.log('Token invalide : 401 OK');
  });
});
