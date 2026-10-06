// E2E — /register?next=… : le contexte d'arrivée (une invitation
// `/rejoindre/<token>`) survit à l'inscription, par les TROIS sorties de la
// page : le lien Discord OAuth, le lien « Connexion » et le corps du POST
// /api/auth/register (le lien de confirmation e-mail y ramènera).
//
// Un `next` dangereux (protocole relatif, antislash, URL absolue) est ignoré
// partout — même validation que /login (utils/auth/safeNext.ts).
//
// Aucune session, aucune écriture : l'inscription et l'autorisation OAuth
// Supabase sont interceptées (`page.route`). Tourne sans clé service.
import { test, expect, type Page } from '@playwright/test';

const NEXT = '/rejoindre/e2e-invite-token';

// lib/i18n/locales/fr/registerPage.ts
const T = {
  submit: 'Créer le compte',
  discord: 'Continuer avec Discord',
  login: 'Connexion',
};

const DANGEROUS = ['//evil.example', '/\\evil.example', 'https://evil.example'];

/** Intercepte l'inscription et rend le corps JSON envoyé. */
async function captureRegister(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === '/api/auth/register',
    async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }
  );
  return bodies;
}

/**
 * Bloque le départ vers Supabase (`/auth/v1/authorize`) — rien ne doit sortir
 * vers le vrai projet — et rend l'URL d'autorisation demandée.
 */
async function captureOAuth(page: Page): Promise<() => Promise<URL>> {
  const seen = page.waitForRequest((req) =>
    new URL(req.url()).pathname.endsWith('/auth/v1/authorize')
  );
  await page.route(
    (url) => url.pathname.endsWith('/auth/v1/authorize'),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>oauth intercepté</body></html>',
      })
  );
  return async () => new URL((await seen).url());
}

/** `next` porté par le `redirect_to` de l'autorisation Discord. */
function nextOfOAuth(authorize: URL): string | null {
  const redirectTo = authorize.searchParams.get('redirect_to');
  if (!redirectTo) return null;
  const target = new URL(redirectTo);
  expect(target.pathname).toBe('/auth/discord-member');
  return target.searchParams.get('next');
}

async function fillAndSubmit(page: Page) {
  await page.locator('input#email').fill('e2e-register-next@example.com');
  await page.locator('input#password').fill('TestPassw0rd!');
  await page.locator('input#confirm').fill('TestPassw0rd!');
  await page
    .locator('#main-content')
    .getByRole('button', { name: T.submit })
    .click();
}

function loginLink(page: Page) {
  return page
    .locator('#main-content')
    .getByRole('link', { name: T.login, exact: true });
}

test.describe('/register?next=', () => {
  test('next sûr : conservé par Discord, « Connexion » et le POST', async ({
    page,
  }) => {
    const bodies = await captureRegister(page);
    await page.goto(`/register?next=${encodeURIComponent(NEXT)}`);

    await expect(page.getByTestId('register-next-context')).toBeVisible({
      timeout: 15000,
    });
    await expect(loginLink(page)).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(NEXT)}`
    );

    await fillAndSubmit(page);
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0].next).toBe(NEXT);

    // En dernier : l'OAuth fait quitter la page.
    const authorize = await captureOAuth(page);
    await page.getByRole('button', { name: T.discord }).click();
    expect(nextOfOAuth(await authorize())).toBe(NEXT);
  });

  for (const bad of DANGEROUS) {
    test(`next dangereux ignoré : ${bad}`, async ({ page }) => {
      const bodies = await captureRegister(page);
      await page.goto(`/register?next=${encodeURIComponent(bad)}`);

      await expect(loginLink(page)).toHaveAttribute('href', '/login', {
        timeout: 15000,
      });
      await expect(page.getByTestId('register-next-context')).toHaveCount(0);

      await fillAndSubmit(page);
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0]).not.toHaveProperty('next');

      // Repli de l'OAuth : l'espace joueuse, jamais la cible externe.
      const authorize = await captureOAuth(page);
      await page.getByRole('button', { name: T.discord }).click();
      expect(nextOfOAuth(await authorize())).toBe('/player');
    });
  }
});
