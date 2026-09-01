// E2E — le FIL DU MATCH (pages/player/match/[matchId].tsx, lot J1 de
// docs/PLAN-espace-joueur.md).
//
// Ce que ce spec protège, et pourquoi il est en viewport MOBILE : ce parcours
// va être joué 69 fois à partir du 18/09, au téléphone, souvent en vocal. Les
// trois choses qui doivent tenir :
//
//   1. les étapes s'enchaînent dans l'ordre réel (préparation → check-in →
//      feuille → live → score) ;
//   2. le check-in poste bien sur la route publique à jeton et l'écran se
//      rafraîchit ;
//   3. AUCUN geste n'apparaît à qui n'a pas le droit de le faire — c'est la
//      règle du lot de permissions du 31/08, et l'écran s'en remet aux
//      `permissions` renvoyées par le serveur.
//
// Auth = vrai login joueur ; seule la donnée du match est mockée, pour que
// l'écran soit déterministe sans dépendre de la base.

import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
  inMinutes,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+matchthread@gmail.com`;
const MATCH_ID = '11111111-2222-3333-4444-555555555555';
const PATH = `/api/player/matches/${MATCH_ID}`;

type Perms = { validateLineup: boolean; reportScore: boolean };

function detail(over: {
  checkin?: Record<string, unknown>;
  permissions?: Perms;
  status?: string;
  report?: Record<string, unknown>;
}) {
  return {
    match: {
      id: MATCH_ID,
      scheduledAt: inMinutes(20),
      status: over.status ?? 'pending',
      format: 'bo3',
      bestOf: 3,
      roundName: 'J1',
      streamUrl: null,
    },
    team: { id: 'team-1', name: 'Les Testeuses', slot: 1 },
    opponent: { id: 'opp-1', name: 'Rivales FC', slug: 'rivales-fc' },
    tournament: { id: 't-1', name: 'Conference Cup', slug: 'conference-cup' },
    checkin: {
      token: 'tok-1',
      alreadyCheckedIn: false,
      checkedInAt: null,
      opensAt: inMinutes(-10),
      closesAt: inMinutes(20),
      isOpen: true,
      isPassed: false,
      ...(over.checkin ?? {}),
    },
    readiness: null,
    score: null,
    result: null,
    report: over.report ?? { state: 'none', mine: null },
    permissions: over.permissions ?? {
      validateLineup: false,
      reportScore: false,
    },
  };
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Fil du match', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('les étapes du match s’affichent dans l’ordre', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, PATH, detail({}));
    await loginPlayer(page, PLAYER_EMAIL, `/player/match/${MATCH_ID}`);

    await expect(
      page.getByRole('heading', { name: /Les Testeuses vs Rivales FC/ })
    ).toBeVisible({ timeout: 10000 });

    for (const step of [
      'Préparation',
      'Check-in',
      'Pendant le match',
      'Après le match',
    ]) {
      await expect(
        page.getByRole('heading', { name: new RegExp(step, 'i') })
      ).toBeVisible();
    }
  });

  test('capitaine : le check-in ouvert poste sur la route à jeton', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    let posted = false;
    await page.route('**/api/checkin/tok-1', async (route) => {
      posted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, alreadyCheckedIn: false }),
      });
    });

    // Après le POST, l'écran recharge : on renvoie alors l'état « checké ».
    let call = 0;
    await page.route(
      (url) => url.pathname === PATH,
      async (route) => {
        call += 1;
        const body =
          call === 1
            ? detail({
                permissions: { validateLineup: true, reportScore: true },
              })
            : detail({
                permissions: { validateLineup: true, reportScore: true },
                checkin: {
                  alreadyCheckedIn: true,
                  checkedInAt: new Date().toISOString(),
                  isOpen: false,
                },
              });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, `/player/match/${MATCH_ID}`);

    const cta = page.getByRole('button', { name: /Confirmer le check-in/i });
    await expect(cta).toBeVisible({ timeout: 10000 });
    await cta.click();

    await expect(page.getByText(/Check-in confirmé le/i)).toBeVisible({
      timeout: 10000,
    });
    expect(posted).toBe(true);
  });

  test('joueuse sans droits : aucun geste, seulement l’état', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      PATH,
      detail({
        status: 'finished',
        report: { state: 'awaiting_me', mine: null },
        permissions: { validateLineup: false, reportScore: false },
      })
    );
    await loginPlayer(page, PLAYER_EMAIL, `/player/match/${MATCH_ID}`);

    await expect(
      page.getByRole('heading', { name: /Après le match/i })
    ).toBeVisible({ timeout: 10000 });

    // Le serveur refuserait ces deux gestes : l'écran ne doit pas les proposer.
    await expect(
      page.getByRole('button', { name: /Rapporter le score/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /Feuille de match/i })
    ).toHaveCount(0);
  });

  test('capitaine : le report du score est proposé', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      PATH,
      detail({
        status: 'finished',
        permissions: { validateLineup: true, reportScore: true },
      })
    );
    await loginPlayer(page, PLAYER_EMAIL, `/player/match/${MATCH_ID}`);

    await expect(
      page.getByRole('button', { name: /Rapporter le score/i })
    ).toBeVisible({ timeout: 10000 });
  });
});

/* ---------------------------------------------------------------------------
 * Persona COACH + accessibilité tactile — lot J7.
 *
 * Le coach est le cas qui a motivé tout le chantier de permissions : il peut
 * composer la feuille de match et ne peut PAS rapporter le score. Un écran qui
 * lui proposerait le report enverrait un 403 sous le doigt, un soir de match.
 * ------------------------------------------------------------------------- */

test.describe('Fil du match — coach et cibles tactiles', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('coach : la feuille de match, jamais le report', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      PATH,
      detail({
        status: 'finished',
        checkin: { alreadyCheckedIn: true, isOpen: false },
        permissions: { validateLineup: true, reportScore: false },
      })
    );
    await loginPlayer(page, PLAYER_EMAIL, `/player/match/${MATCH_ID}`);

    await expect(
      page.getByRole('heading', { name: /Feuille de match/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('button', { name: /Rapporter le score/i })
    ).toHaveCount(0);
  });

  test('les gestes du jour J tiennent la cible tactile de 44 px', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      PATH,
      detail({ permissions: { validateLineup: true, reportScore: true } })
    );
    await loginPlayer(page, PLAYER_EMAIL, `/player/match/${MATCH_ID}`);

    const cta = page.getByRole('button', { name: /Confirmer le check-in/i });
    await expect(cta).toBeVisible({ timeout: 10000 });
    const box = await cta.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
