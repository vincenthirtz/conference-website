// E2E — « Le Ruban » : quelle page porte quelle SURFACE, et quels jetons.
//
// docs/PLAN-industrialisation-joueur.md (« Un seul Le Ruban, iso entre l'admin
// et l'espace joueuse », P7) et docs/PLAN-industrialisation-admin.md (L12).
// pages/_app.tsx pose `data-surface` d'après utils/layout/appChrome.ts ;
// styles/ruban-tokens.css accroche les jetons à `:root:has([data-surface=…])`.
// Ce que la spec verrouille, dans un VRAI navigateur :
//   - /admin/* → surface « admin » ;
//   - l'espace joueuse (/player/*, /espace-capitaine, /checkin/[token],
//     /invitation/[token], /team/[slug]/edit) → surface « player » ;
//   - le site public (/, /team/[slug], /team/create, /player/[userId],
//     /scrims, /rejoindre) → AUCUNE surface et AUCUN jeton Ruban, même
//     connectée : le public ne bouge pas ;
//   - les jetons résolus sont IDENTIQUES sur une page admin et une page
//     joueuse ; seules les variables de densité/coquille diffèrent.
//
// Comptes et équipe créés ici (tenant par défaut), supprimés en fin de fichier.

import { test, expect, type Browser } from '@playwright/test';
import {
  createTestPlayer,
  createTestStaff,
  deleteTestStaff,
  deleteTestUser,
  supabaseTestClient,
} from '../utils/supabaseTestClient';
import { loginPlayer, skipIfNoServiceRole } from './_helpers/playerSession';
import {
  RUBAN_EXPECTED,
  RUBAN_PASSWORD,
  RUBAN_TOKENS,
  expectSurface,
  loginStaff,
  readRootTokens,
} from './_helpers/ruban';

const PLAYER_EMAIL = 'hirtzvincent+rubansurfplayer@gmail.com';
const STAFF_EMAIL = 'hirtzvincent+rubansurfstaff@gmail.com';
const TEAM_NAME = `Ruban Surfaces ${Date.now().toString(36)}`;
// Jeton inconnu : la page répond (état « lien invalide »), la route reste la même.
const BOGUS_TOKEN = 'ruban-e2e-jeton-inconnu';

let playerId = '';
let teamId = '';
let teamSlug = '';

/** Un second contexte avec les réglages du projet (baseURL, consentement). */
async function projectContext(browser: Browser) {
  const use = test.info().project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    storageState: use.storageState,
    viewport: use.viewport,
  });
}

test.describe('Le Ruban — surfaces et jetons', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole() || !supabaseTestClient) return;
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
    const player = await createTestPlayer(PLAYER_EMAIL, RUBAN_PASSWORD);
    playerId = player!.id;
    await createTestStaff(STAFF_EMAIL, RUBAN_PASSWORD, 'admin');
    // Capitaine d'une équipe : ouvre /team/[slug]/edit et une fiche publique.
    const { data: team, error } = await supabaseTestClient
      .from('teams')
      .insert({ name: TEAM_NAME, is_active: true, captain_id: playerId })
      .select('id, slug')
      .single();
    if (error) throw error;
    teamId = team!.id as string;
    teamSlug = (team!.slug as string) || teamId;
    await supabaseTestClient
      .from('team_members')
      .insert({ team_id: teamId, user_id: playerId, role: 'captain' });
  });

  test.afterAll(async () => {
    if (supabaseTestClient && teamId) {
      await supabaseTestClient
        .from('team_members')
        .delete()
        .eq('team_id', teamId);
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }
    await deleteTestUser(PLAYER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('site public (anonyme) : aucune surface, aucun jeton Ruban', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    const routes = [
      '/',
      '/team/create',
      '/scrims',
      '/rejoindre',
      `/team/${teamSlug}`,
      `/player/${playerId}`,
    ];
    for (const route of routes) {
      await test.step(route, async () => {
        const res = await page.goto(route);
        expect(res?.status(), route).toBeLessThan(500);
        await expectSurface(page, null);
        const tokens = await readRootTokens(page, RUBAN_TOKENS);
        for (const [name, value] of Object.entries(tokens)) {
          expect(value, `${route} : ${name} ne doit pas être défini`).toBe('');
        }
      });
    }
  });

  test('espace joueuse hors /player (anonyme) : surface « player »', async ({
    page,
  }) => {
    for (const route of [
      '/espace-capitaine',
      `/checkin/${BOGUS_TOKEN}`,
      `/invitation/${BOGUS_TOKEN}`,
    ]) {
      await test.step(route, async () => {
        await page.goto(route);
        expect(new URL(page.url()).pathname).toBe(route);
        await expectSurface(page, 'player');
      });
    }
  });

  test('joueuse connectée : son espace porte « player », le public reste nu', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginPlayer(page, PLAYER_EMAIL, '/player', RUBAN_PASSWORD);

    for (const route of [
      '/player',
      '/player/matches',
      '/player/manage-team',
      '/player/profile',
      `/team/${teamSlug}/edit`,
    ]) {
      await test.step(route, async () => {
        await page.goto(route);
        // Pas de redirection silencieuse vers une autre page.
        expect(new URL(page.url()).pathname).toBe(route);
        await expectSurface(page, 'player');
      });
    }

    // Même connectée, la surface dépend de la ROUTE : le public reste public.
    for (const route of [
      '/',
      `/team/${teamSlug}`,
      '/team/create',
      `/player/${playerId}`,
    ]) {
      await test.step(`${route} (connectée)`, async () => {
        await page.goto(route);
        await expectSurface(page, null);
        const tokens = await readRootTokens(page, [
          '--canvas',
          '--or',
          '--r-card',
        ]);
        expect(Object.values(tokens).join('')).toBe('');
      });
    }
  });

  test('admin : surface « admin » sur /admin/*', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await loginStaff(page, STAFF_EMAIL);
    for (const route of [
      '/admin',
      '/admin/api-tokens',
      '/admin/users/manage',
    ]) {
      await test.step(route, async () => {
        await page.goto(route);
        expect(new URL(page.url()).pathname).toBe(route);
        await expectSurface(page, 'admin');
      });
    }
  });

  test('jetons iso : admin et espace joueuse résolvent les MÊMES valeurs', async ({
    page,
    browser,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await loginStaff(page, STAFF_EMAIL);
    await page.goto('/admin');
    await expectSurface(page, 'admin');
    const admin = await readRootTokens(page);

    const ctx = await projectContext(browser);
    try {
      const playerPage = await ctx.newPage();
      await loginPlayer(
        playerPage,
        PLAYER_EMAIL,
        '/player/profile',
        RUBAN_PASSWORD
      );
      await playerPage.goto('/player/profile');
      await expectSurface(playerPage, 'player');
      const player = await readRootTokens(playerPage);

      for (const name of RUBAN_TOKENS) {
        expect(admin[name], `${name} défini côté admin`).not.toBe('');
        expect(player[name], `${name} : joueuse = admin`).toBe(admin[name]);
      }
      for (const [name, value] of Object.entries(RUBAN_EXPECTED)) {
        expect(admin[name].toLowerCase(), name).toBe(value);
      }
      // Seules la densité et la coquille diffèrent.
      expect(player['--target-min']).toBe('44px');
      expect(player['--body-size']).toBe('16px');
      expect(admin['--target-min']).toBe('');
      expect(admin['--admin-sidebar-w']).toBe('236px');
      expect(player['--admin-sidebar-w']).toBe('');

      // Le fond de page suit le même jeton des deux côtés.
      const bg = async (p: typeof page) =>
        p.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(await bg(playerPage)).toBe(await bg(page));
      expect(await bg(page)).toBe('rgb(7, 3, 10)');
    } finally {
      await ctx.close();
    }
  });

  test('les aperçus /dev/* ne sont pas servis en production', async ({
    page,
  }) => {
    test.skip(
      process.env.E2E_SERVER !== 'start',
      'next dev sert /dev/* ; seul `next start` (CI) les refuse'
    );
    for (const route of ['/dev/ruban-kit', '/dev/player-kit']) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(404);
    }
  });
});
