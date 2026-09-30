// E2E — « Le Ruban » : les BRIQUES du kit (features/ruban) ont la même
// grammaire dans l'admin et dans l'espace joueuse ; seule la DENSITÉ change.
//
// docs/PLAN-industrialisation-joueur.md (P7 : un seul kit, mêmes jetons,
// mêmes briques) et docs/PLAN-industrialisation-admin.md (L12).
// Deux écrans réels, chacun avec un bouton `primary` taille md et une puce
// `brand` du kit :
//   - admin  : /admin/api-tokens (« Créer le token », puce « Partenaire ») —
//              la liste est simulée (GET /api/admin/api-tokens) pour qu'une
//              ligne existe ; le reste est réel ;
//   - joueuse : /player/profile (« Enregistrer », puce de rôle « Joueuse »).
// On compare des styles CALCULÉS : police display, capitales, graisse, rayon
// (--r-ctrl), couleurs de signal, hauteur md ; puis la densité (cibles ≥ 44 px
// côté joueuse, tailles compactes gardées côté admin), le focus visible et le
// contraste AA des puces.

import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  createTestPlayer,
  createTestStaff,
  deleteTestStaff,
  deleteTestUser,
} from '../utils/supabaseTestClient';
import { loginPlayer, skipIfNoServiceRole } from './_helpers/playerSession';
import {
  GRAMMAR_PROPS,
  RUBAN_PASSWORD,
  computed,
  contrastRatio,
  keyboardFocus,
  loginStaff,
} from './_helpers/ruban';

const PLAYER_EMAIL = 'hirtzvincent+rubanbrickplayer@gmail.com';
const STAFF_EMAIL = 'hirtzvincent+rubanbrickstaff@gmail.com';
const TOKEN_ID = '5b0c3e2a-7d41-4c9a-9f1e-2a6b8c4d0e11';

const COLOR_PROPS = ['color', 'background-color', 'border-top-color'] as const;
const FOCUS_PROPS = [
  'outline-style',
  'outline-width',
  'outline-color',
  'outline-offset',
] as const;

async function projectContext(browser: Browser) {
  const use = test.info().project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    storageState: use.storageState,
    viewport: use.viewport,
  });
}

async function openAdminTokens(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/admin/api-tokens',
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              tokens: [
                {
                  id: TOKEN_ID,
                  name: 'Ruban e2e',
                  token_prefix: 'owc_ruban',
                  scopes: ['read'],
                  created_at: '2026-01-01T10:00:00.000Z',
                  last_used_at: null,
                  revoked_at: null,
                  expires_at: null,
                  created_by: null,
                  created_by_name: null,
                  comp: true,
                  comp_note: null,
                },
              ],
            }),
          })
        : route.continue()
  );
  await loginStaff(page, STAFF_EMAIL);
  await page.goto('/admin/api-tokens');
  await expect(page.getByTestId(`api-token-row-${TOKEN_ID}`)).toBeVisible({
    timeout: 20000,
  });
  return {
    primary: page.getByTestId('api-token-create-btn'),
    compact: page.getByTestId(`api-token-revoke-btn-${TOKEN_ID}`),
    chip: page.getByTestId(`api-token-comp-badge-${TOKEN_ID}`).locator('span'),
    h1: page.locator('main h1').first(),
  };
}

async function openPlayerProfile(page: Page) {
  await loginPlayer(page, PLAYER_EMAIL, '/player/profile', RUBAN_PASSWORD);
  await page.goto('/player/profile');
  // Le bouton du KIT (d'autres « Enregistrer » non migrés existent plus bas).
  const primary = page
    .getByRole('button', { name: 'Enregistrer' })
    .and(page.locator('[data-ruban-target]'))
    .first();
  await expect(primary).toBeVisible({ timeout: 20000 });
  return {
    primary,
    chip: page.locator('main').getByText('Joueuse', { exact: true }).first(),
    h1: page.locator('main h1').first(),
  };
}

test.describe('Le Ruban — briques iso admin ↔ joueuse', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
    await createTestPlayer(PLAYER_EMAIL, RUBAN_PASSWORD);
    await createTestStaff(STAFF_EMAIL, RUBAN_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('bouton, puce et titre : même grammaire des deux côtés', async ({
    page,
    browser,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const admin = await openAdminTokens(page);
    const ctx = await projectContext(browser);
    try {
      const player = await openPlayerProfile(await ctx.newPage());

      // Bouton primary md.
      const btnProps = [
        ...GRAMMAR_PROPS,
        ...COLOR_PROPS,
        'font-size',
        'letter-spacing',
      ];
      const aBtn = await computed(admin.primary, btnProps);
      const pBtn = await computed(player.primary, btnProps);
      expect(pBtn).toEqual(aBtn);
      expect(aBtn['text-transform']).toBe('uppercase');
      expect(aBtn['font-family']).toMatch(/archivo/i);
      expect(aBtn['border-top-left-radius']).toBe('4px'); // --r-ctrl
      expect(aBtn['background-color']).toBe('rgb(127, 202, 101)'); // --lf
      const aBox = await admin.primary.boundingBox();
      const pBox = await player.primary.boundingBox();
      expect(Math.round(aBox!.height)).toBe(44);
      expect(Math.round(pBox!.height)).toBe(44);

      // Puce brand.
      const chipProps = [
        ...GRAMMAR_PROPS,
        ...COLOR_PROPS,
        'font-size',
        'letter-spacing',
        'height',
      ];
      const aChip = await computed(admin.chip, chipProps);
      const pChip = await computed(player.chip, chipProps);
      expect(pChip).toEqual(aChip);
      expect(aChip['font-family']).toMatch(/archivo/i);
      expect(aChip['text-transform']).toBe('uppercase');

      // Titre de page : police display, capitales.
      const hProps = [
        'font-family',
        'text-transform',
        'font-weight',
        'font-stretch',
      ];
      const aH1 = await computed(admin.h1, hProps);
      const pH1 = await computed(player.h1, hProps);
      expect(pH1).toEqual(aH1);
      expect(aH1['font-family']).toMatch(/archivo/i);
      expect(aH1['text-transform']).toBe('uppercase');
    } finally {
      await ctx.close();
    }
  });

  test('densité : cibles ≥ 44 px côté joueuse, tailles compactes gardées côté admin', async ({
    page,
    browser,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const admin = await openAdminTokens(page);
    // Admin : le bouton xs reste compact (30 px) — densité d'outil.
    const compact = await admin.compact.boundingBox();
    expect(Math.round(compact!.height)).toBeLessThan(44);

    const ctx = await projectContext(browser);
    try {
      const pp = await ctx.newPage();
      await openPlayerProfile(pp);
      const heights = await pp.evaluate(() =>
        Array.from(document.querySelectorAll('[data-ruban-target]'))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              text: (el.textContent ?? '').trim().slice(0, 40),
              h: r.height,
              w: r.width,
            };
          })
          .filter((b) => b.w > 0 && b.h > 0)
      );
      expect(heights.length).toBeGreaterThan(0);
      for (const b of heights) {
        expect(b.h, `cible « ${b.text} »`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await ctx.close();
    }
  });

  test('focus visible : même anneau orchidée sur les deux surfaces', async ({
    page,
    browser,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const admin = await openAdminTokens(page);
    await keyboardFocus(page, admin.primary);
    const aFocus = await computed(admin.primary, FOCUS_PROPS);
    expect(aFocus['outline-style']).toBe('solid');
    expect(aFocus['outline-width']).toBe('2px');
    expect(aFocus['outline-color']).toBe('rgb(202, 133, 230)'); // --or-400

    const ctx = await projectContext(browser);
    try {
      const pp = await ctx.newPage();
      const player = await openPlayerProfile(pp);
      await keyboardFocus(pp, player.primary);
      expect(await computed(player.primary, FOCUS_PROPS)).toEqual(aFocus);
    } finally {
      await ctx.close();
    }
  });

  test('contraste AA des puces (texte ≥ 4,5:1 sur leur fond effectif)', async ({
    page,
    browser,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const admin = await openAdminTokens(page);
    const okChip = page
      .getByTestId(`api-token-row-${TOKEN_ID}`)
      .getByText('Actif', { exact: true });
    for (const chip of [admin.chip, okChip]) {
      expect(await contrastRatio(chip)).toBeGreaterThanOrEqual(4.5);
    }
    const ctx = await projectContext(browser);
    try {
      const player = await openPlayerProfile(await ctx.newPage());
      expect(await contrastRatio(player.chip)).toBeGreaterThanOrEqual(4.5);
    } finally {
      await ctx.close();
    }
  });

  test('la police display est RÉELLEMENT chargée (pas un repli système)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const admin = await openAdminTokens(page);
    const result = await admin.primary.evaluate(async (el) => {
      await document.fonts.ready;
      const family = getComputedStyle(el).fontFamily;
      const first = family
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/g, '');
      const faces = Array.from(document.fonts).map((f) =>
        f.family.replace(/^["']|["']$/g, '')
      );
      return { first, family, faces: Array.from(new Set(faces)) };
    });
    expect(
      result.faces,
      `police « ${result.first} » (font-family: ${result.family}) absente des @font-face`
    ).toContain(result.first);
  });
});
