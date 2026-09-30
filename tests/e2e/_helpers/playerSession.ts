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
 * Connexion par le VRAI formulaire /login, jusqu'à ce que `arrived(url)`.
 *
 * Trois écueils rencontrés en CI, et leur parade :
 *  - la page /login se remonte une fois à l'hydratation : des champs remplis
 *    avant peuvent être vidés → on vérifie les valeurs avant de soumettre ;
 *  - le trajet /login → espace peut dépasser 15 s sur un runner chargé →
 *    30 s, et l'on n'attend que l'URL (`commit`), pas le `load` de l'espace ;
 *  - une 2e tentative peut arriver alors que la 1re a abouti : /login
 *    redirige alors tout seul → on le détecte avant de remplir.
 * Le bouton visé est celui du FORMULAIRE (#main-content) : le pied de page
 * (newsletter) a aussi un submit.
 */
async function loginThroughForm(
  page: Page,
  loginUrl: string,
  email: string,
  password: string,
  arrived: (url: URL) => boolean
): Promise<void> {
  const redirectedAway = () =>
    page
      .waitForURL(arrived, { timeout: 3000, waitUntil: 'commit' })
      .then(() => true)
      .catch(() => false);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(loginUrl);
    if (
      attempt > 1 &&
      (arrived(new URL(page.url())) || (await redirectedAway()))
    )
      return;

    const emailInput = page.locator('input#email');
    const passwordInput = page.locator('input#password');
    await expect(emailInput).toBeEditable();
    for (let i = 0; i < 3; i += 1) {
      await emailInput.fill(email);
      await passwordInput.fill(password);
      if (
        (await emailInput.inputValue()) === email &&
        (await passwordInput.inputValue()) === password
      )
        break;
    }
    await page.locator('#main-content button[type="submit"]').click();
    try {
      await page.waitForURL(arrived, { timeout: 30000, waitUntil: 'commit' });
      return;
    } catch (err) {
      if (arrived(new URL(page.url()))) return;
      if (attempt === 2) throw err;
    }
  }
}

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
  await loginThroughForm(
    page,
    `/login?next=${encodeURIComponent(next)}`,
    email,
    password,
    (url) => !url.pathname.startsWith('/login')
  );
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

/** Connexion staff par le vrai formulaire /login, jusqu'à l'admin. */
export async function loginStaff(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await loginThroughForm(
    page,
    '/login',
    email,
    password,
    (url) =>
      url.pathname.startsWith('/admin') &&
      !url.pathname.startsWith('/admin/login')
  );
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
