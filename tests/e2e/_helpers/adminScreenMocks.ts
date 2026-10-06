// tests/e2e/_helpers/adminScreenMocks.ts — specs « écran admin » (lot A10).
//
// Patron des specs player-*.spec.ts : VRAIE connexion staff (la garde SSR
// `withStaffPage` ne se mocke pas), mais TOUTES les routes API lues ou écrites
// par l'écran sont interceptées (`page.route`). Le test vérifie donc l'écran —
// rendu + action principale + requête envoyée — sans dépendre des données ni
// en écrire.
//
// Sans clé service role (création du compte staff impossible), les specs se
// désactivent d'elles-mêmes via `skipIfNoServiceRole`.

import type { Page, Request } from '@playwright/test';

export const STAFF_PASSWORD = 'TestPassw0rd!';

export const E2E_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

type Matcher = string | RegExp | ((pathname: string) => boolean);

function matches(m: Matcher, pathname: string): boolean {
  if (typeof m === 'string') return pathname === m;
  if (m instanceof RegExp) return m.test(pathname);
  return m(pathname);
}

/**
 * Répond `body` (JSON) aux requêtes `method` dont le chemin correspond.
 * Les autres méthodes sur le même chemin passent au serveur réel.
 */
export async function mockJson(
  page: Page,
  matcher: Matcher,
  body: unknown,
  opts: { method?: string; status?: number } = {}
): Promise<void> {
  const method = (opts.method ?? 'GET').toUpperCase();
  await page.route(
    (url) => matches(matcher, url.pathname),
    async (route) => {
      if (route.request().method() !== method) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: opts.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

/**
 * Comme `mockJson`, mais garde la trace des requêtes reçues (corps JSON
 * décodé) pour que le test vérifie CE QUE l'écran a envoyé.
 */
export async function captureJson(
  page: Page,
  matcher: Matcher,
  body: unknown,
  opts: { method?: string; status?: number } = {}
): Promise<{ requests: { url: string; body: any }[] }> {
  const method = (opts.method ?? 'POST').toUpperCase();
  const seen: { url: string; body: any }[] = [];
  await page.route(
    (url) => matches(matcher, url.pathname),
    async (route) => {
      const req: Request = route.request();
      if (req.method() !== method) {
        await route.fallback();
        return;
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(req.postData() || 'null');
      } catch {
        parsed = req.postData();
      }
      seen.push({ url: req.url(), body: parsed });
      await route.fulfill({
        status: opts.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
  return { requests: seen };
}

/** Espace actif figé : les écrans multi-espace lisent son id. */
export async function mockActiveTenant(page: Page): Promise<void> {
  await mockJson(page, '/api/admin/active-tenant', {
    tenant: {
      id: E2E_TENANT_ID,
      slug: 'conference',
      name: 'Conférence',
      is_active: true,
      default_locale: 'fr',
    },
    source: 'default',
  });
}

/** L'overlay de dev Next intercepte les clics (cf. admin-demandes.spec.ts). */
export async function dismissNextDevOverlay(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content:
        'nextjs-portal, nextjs-portal * { display: none !important; pointer-events: none !important; }',
    })
    .catch(() => undefined);
}
