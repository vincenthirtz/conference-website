/**
 * Tests E2E — le chantier « plateforme de tournois » est bien gardé.
 *
 * Lot 10 de docs/PLAN-plateforme-tournois.md.
 *
 * POURQUOI SANS SEED. Toutes les autres suites admin créent un compte staff via
 * le service-role, ce que le garde-fou de `tests/utils/supabaseTestClient.ts`
 * refuse en absolu contre la production — il faut une Supabase LOCALE. Cette
 * suite-là n'écrit rien : elle vérifie ce qui se vérifie sans compte, à savoir
 * que les écrans et endpoints ajoutés par les lots 2 à 6 ne sont pas ouverts.
 *
 * C'est exactement le défaut qui passe inaperçu : un `withStaffPage` oublié sur
 * une page neuve ne casse aucun test fonctionnel, et n'apparaît qu'au moment où
 * quelqu'un ouvre l'URL sans session.
 */
import { test, expect } from '@playwright/test';

// UUID quelconque : le contrôle d'accès doit tomber AVANT toute lecture, donc
// l'existence de la cible ne doit rien changer au résultat.
const TOURNAMENT_ID = '00000000-0000-4000-8000-000000000001';
const TEAM_ID = '00000000-0000-4000-8000-000000000002';

test.describe('Planning admin — contrôle d’accès', () => {
  test('la page Planning renvoie à la connexion sans session', async ({
    page,
  }) => {
    await page.goto(`/admin/tournament/${TOURNAMENT_ID}/schedule`);
    // La chaîne est `/admin/...` → `/admin/login` → `/login` : la page de
    // connexion admin renvoie elle-même vers la page unifiée. On assert donc
    // sur la DESTINATION finale, pas sur le premier saut.
    await expect(page).toHaveURL(/\/login/);
  });

  test('le diagnostic de planning refuse un appel non authentifié', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/tournament/${TOURNAMENT_ID}/schedule-diagnostics`
    );
    expect(res.status()).toBe(401);
  });

  test('les contraintes d’équipe refusent un appel non authentifié', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/teams/${TEAM_ID}/availability`
    );
    expect(res.status()).toBe(401);
  });

  test('le déplacement de match refuse une origine étrangère', async ({
    request,
  }) => {
    // La garde CSRF tombe avant l'authentification : sur une route qui ÉCRIT,
    // c'est l'ordre souhaitable — on ne veut même pas résoudre la session d'une
    // requête dont l'origine ne correspond pas.
    const res = await request.post(
      `/api/admin/tournament/${TOURNAMENT_ID}/schedule-move`,
      {
        data: { moves: [] },
        headers: { origin: 'https://exemple-malveillant.test' },
      }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('le déplacement de match n’est jamais accessible en GET', async ({
    request,
  }) => {
    const res = await request.get(
      `/api/admin/tournament/${TOURNAMENT_ID}/schedule-move`
    );
    // 401 (session d'abord) ou 405 (méthode) — jamais 200.
    expect(res.status()).not.toBe(200);
  });
});
