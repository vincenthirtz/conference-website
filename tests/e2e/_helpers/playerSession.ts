// Shared helpers for the authenticated player-area e2e specs.
//
// These specs follow the SAME harness as the rest of tests/e2e:
//   - a REAL test player is created via the service-role client
//     (createTestPlayer) so a genuine Supabase session/cookie is established
//     and usePlayerSession / useAdminFetch resolve it exactly like in prod;
//   - the player logs in through the real /login form (input#email /
//     input#password / button[type=submit]) — identical to auth.spec.ts &
//     password-change.spec.ts;
//   - only the /api/player/* DATA endpoints are route-mocked, so the UI under
//     test is deterministic and independent of DB state.
//
// We deliberately do NOT mock /api/admin/me: the login page calls it and
// relies on the real 403 (non-staff) to route a player to /player.

import { expect, type Page } from '@playwright/test';

export const PLAYER_PASSWORD = 'TestPassw0rd!';

/** True when no service-role key is configured → real login impossible. */
export const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

/**
 * Log a player in through the real /login form and land on `next`.
 * A plain player (role 'player') gets a 403 from /api/admin/me and is routed
 * to `next` (or /player by default).
 */
export async function loginPlayer(
  page: Page,
  email: string,
  next: string,
  password: string = PLAYER_PASSWORD
): Promise<void> {
  const loginUrl = `/login?next=${encodeURIComponent(next)}`;
  const leftLogin = (url: URL) => !url.pathname.startsWith('/login');

  // Deux tentatives. Sur un serveur encore froid (première connexion d'une
  // tranche CI), un clic arrivé avant l'hydratation soumet le formulaire en
  // natif (GET /login?…) : on reste sur /login sans erreur. La connexion
  // n'est pas l'objet des specs qui l'utilisent — on la rejoue une fois.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(loginUrl);
    // 2e passage : la 1re connexion a pu aboutir entre-temps (/login redirige).
    if (leftLogin(new URL(page.url()))) return;
    await page.fill('input#email', email);
    await page.fill('input#password', password);
    // Le bouton du FORMULAIRE : le pied de page (newsletter) a aussi un submit.
    await page.click('#main-content button[type="submit"]');
    try {
      // `commit` : seule l'URL compte ici ; attendre le `load` de la page
      // d'arrivée faisait échouer la connexion quand l'espace était lent.
      await page.waitForURL(leftLogin, { timeout: 15000, waitUntil: 'commit' });
      return;
    } catch (err) {
      if (leftLogin(new URL(page.url()))) return;
      if (attempt === 2) throw err;
    }
  }
}

type JsonMock = Record<string, unknown> | unknown[];

/**
 * Register a JSON route mock for an exact /api/... path (query string ignored).
 * Returns nothing; call before navigating to the page that fetches it.
 */
export async function mockApiJson(
  page: Page,
  pathname: string,
  body: JsonMock,
  status = 200
): Promise<void> {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

/* --------------------------------------------------------------------------
 * Deterministic payload builders matching the API response shapes.
 * (Mirror pages/api/player/matches.ts, next-match.ts, notifications.ts.)
 * ------------------------------------------------------------------------ */

export function inMinutes(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

export type MockMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  roundName: string | null;
  format: string | null;
  bestOf: number | null;
  streamUrl: string | null;
  slot: 1 | 2;
  opponent: { id: string; name: string } | null;
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
};

export function buildMatch(overrides: Partial<MockMatch>): MockMatch {
  return {
    id: 'm-default',
    scheduledAt: inMinutes(60),
    status: 'pending',
    roundName: 'Quart de finale',
    format: 'bo3',
    bestOf: 3,
    streamUrl: null,
    slot: 1,
    opponent: { id: 'opp-default', name: 'Team Adverse' },
    score: null,
    result: null,
    tournament: { id: 't-1', name: 'Conference Cup', slug: 'conference-cup' },
    checkin: null,
    ...overrides,
  };
}

/**
 * Connexion staff par le vrai formulaire /login, jusqu'à l'admin. Même
 * seconde tentative que `loginPlayer` (soumission avant hydratation sur un
 * serveur froid : on reste sur /login sans erreur).
 */
export async function loginStaff(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const inAdmin = (url: URL) =>
    url.pathname.startsWith('/admin') &&
    !url.pathname.startsWith('/admin/login');
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto('/login');
    if (inAdmin(new URL(page.url()))) return;
    await page.fill('input#email', email);
    await page.fill('input#password', password);
    await page.click('#main-content button[type="submit"]');
    try {
      await page.waitForURL(inAdmin, { timeout: 15000, waitUntil: 'commit' });
      return;
    } catch (err) {
      if (inAdmin(new URL(page.url()))) return;
      if (attempt === 2) throw err;
    }
  }
}

/**
 * Adresse propre au worker Playwright courant.
 *
 * Les specs du projet `mobile` sont AUSSI jouées par `chromium`, dans la
 * même tranche et donc sur la même base, par deux workers en parallèle. Une
 * adresse fixe y est partagée : le `beforeAll` de l'un supprime le compte de
 * l'autre en plein test (connexions qui échouent, équipes « déjà prises »).
 * `TEST_PARALLEL_INDEX` (posé par Playwright dans chaque worker) les sépare.
 */
export function perWorker(email: string): string {
  const idx = process.env.TEST_PARALLEL_INDEX;
  const at = email.indexOf('@');
  if (!idx || at < 0) return email;
  return `${email.slice(0, at)}-w${idx}${email.slice(at)}`;
}

/**
 * L'entrée « Connexion » de la barre publique est visible — y compris sous
 * 1119 px, où elle vit dans le tiroir du bouton « Ouvrir le menu ».
 */
export async function expectPublicLoginEntry(page: Page): Promise<void> {
  const burger = page.getByRole('button', { name: 'Ouvrir le menu' });
  if (await burger.isVisible()) await burger.click();
  await expect(
    page.locator('a:has-text("Connexion")').filter({ visible: true }).first()
  ).toBeVisible({ timeout: 10000 });
}
