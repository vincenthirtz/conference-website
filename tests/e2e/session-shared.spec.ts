// E2E — SessionProvider partagé + redirection loginPath côté joueur.
//
// Deux garanties introduites par le refactor « session partagée » + le fix du
// loginPath des pages joueur :
//
//   1. Une session joueur invalidée côté serveur (401 sur un endpoint
//      /api/player/* SANS skipAuthRedirect) renvoie vers /login — jamais vers
//      /admin/login. Avant le fix, plusieurs pages joueur héritaient du
//      loginPath par défaut '/admin/login' et éjectaient le joueur sur le
//      login staff.
//
//   2. L'unique SessionProvider alimente à la fois la nav marketing
//      (useAuthSession) et la barre joueur (usePlayerSession) : un joueur
//      connecté est reconnu sur une route publique PUIS sur /player, sans
//      re-login ni bouton « Connexion ».
//
// Auth = login réel (cf. _helpers/playerSession.ts) ; seuls les endpoints
// /api/player/* et /api/admin/me sont route-mockés pour rendre le scénario
// déterministe et indépendant de l'état DB.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = 'hirtzvincent+sessshared@gmail.com';

const EMPTY_NOTIFS = {
  hasTeam: false,
  isCaptain: false,
  isManager: false,
  captainTeamId: null,
  memberTeamId: null,
  unreadMessages: 0,
  pendingScrims: 0,
  pendingJoinRequests: 0,
  checkinPending: 0,
  total: 0,
};

test.describe('Session partagée & redirection joueur', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('un 401 sur une page joueur redirige vers /login (jamais /admin/login)', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/notifications', EMPTY_NOTIFS);

    // 1) Login réel → /player. Le dashboard réel répond 200 (joueur sans équipe).
    await loginPlayer(page, PLAYER_EMAIL, '/player');
    await expect(
      page.getByRole('button', { name: 'Déconnexion' })
    ).toBeVisible({ timeout: 10000 });

    // 2) On invalide la session côté serveur : le prochain chargement du
    //    dashboard renvoie 401. On mocke aussi /api/admin/me en 401 pour que la
    //    page /login (qui auto-route un utilisateur déjà authentifié) ne nous
    //    renvoie pas en boucle sur /player — elle reste sur /login.
    await page.route(
      (url) => url.pathname === '/api/player/dashboard',
      (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not authenticated.' }),
        })
    );
    await page.route(
      (url) => url.pathname === '/api/admin/me',
      (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token required.' }),
        })
    );

    await page.reload();

    // 3) usePlayerSession voit encore un cookie valide (pas de redirect de sa
    //    part) ; c'est useAdminFetch qui, sur le 401 du dashboard, redirige vers
    //    le loginPath — désormais /login et non /admin/login.
    await page.waitForURL(/\/login(\?|$)/, { timeout: 10000 });
    expect(page.url()).not.toContain('/admin/login');
  });

  test('un joueur connecté est reconnu sur une route publique puis sur /player', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/notifications', EMPTY_NOTIFS);

    await loginPlayer(page, PLAYER_EMAIL, '/player');
    await expect(
      page.getByRole('button', { name: 'Déconnexion' })
    ).toBeVisible({ timeout: 10000 });

    // Route publique : la nav marketing lit la MÊME session via le provider.
    await page.goto('/');
    // Le bloc « Connexion / Inscription » staff est masqué car authUser présent.
    await expect(page.locator('a:has-text("Connexion")')).toHaveCount(0);
    // La cloche joueur (PlayerBell → useAuthSession) est visible pour un connecté.
    await expect(
      page.getByRole('link', { name: /Notifications/ })
    ).toBeVisible({ timeout: 10000 });

    // Retour sur /player : la barre joueur (usePlayerSession) réapparaît sans
    // re-login → le provider a bien conservé la session à travers les routes.
    await page.goto('/player');
    await expect(
      page.getByRole('button', { name: 'Déconnexion' })
    ).toBeVisible({ timeout: 10000 });
  });
});
