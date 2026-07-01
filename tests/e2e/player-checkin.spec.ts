// E2E — pages/player/checkin.tsx (focused check-in flow)
//
// GET /api/player/next-match drives the state machine:
//   - no match,
//   - already checked in,
//   - window open → "Valider le check-in" POSTs /api/checkin/{token}; on 200
//     the page re-loads next-match and shows the validated state.
//
// Auth = real player login; next-match + checkin POST are route-mocked.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
  inMinutes,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+playercheckin@gmail.com`;

const teamRef = { id: 'team-1', name: 'Les Testeuses', slot: 1 as const };
const opponent = { id: 'opp-1', name: 'Rivales FC' };
const tournament = {
  id: 't-1',
  name: 'Conference Cup',
  slug: 'conference-cup',
};

function nextMatchPayload(
  checkin: Record<string, unknown> | null,
  status = 'pending'
) {
  return {
    match: {
      id: 'm-1',
      scheduledAt: inMinutes(15),
      status,
      format: 'bo3',
      roundName: 'Demi-finale',
      streamUrl: null,
      bestOf: 3,
    },
    team: teamRef,
    opponent,
    tournament,
    checkin,
  };
}

test.describe('Player check-in page', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('no match → empty state', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/next-match', {
      match: null,
      team: null,
      opponent: null,
      tournament: null,
      checkin: null,
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/checkin');

    await expect(
      page.getByText('Aucun match à valider pour le moment')
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole('link', { name: 'Voir mes matchs' })
    ).toBeVisible();
  });

  test('already checked in → validated state', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      '/api/player/next-match',
      nextMatchPayload({
        token: 'tok-1',
        alreadyCheckedIn: true,
        checkedInAt: inMinutes(-2),
        opensAt: inMinutes(-10),
        closesAt: inMinutes(15),
        isOpen: true,
        isPassed: false,
      })
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/checkin');

    await expect(
      page.getByRole('heading', { name: 'Check-in validé' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('open window → clicking "Valider le check-in" POSTs and shows success', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    // Stateful next-match: not-yet-checked-in until the POST flips it.
    let checkedIn = false;
    await page.route(
      (url) => url.pathname === '/api/player/next-match',
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            nextMatchPayload({
              token: 'tok-1',
              alreadyCheckedIn: checkedIn,
              checkedInAt: checkedIn ? inMinutes(0) : null,
              opensAt: inMinutes(-10),
              closesAt: inMinutes(15),
              isOpen: true,
              isPassed: false,
            })
          ),
        });
      }
    );

    let postCalled = false;
    await page.route('**/api/checkin/tok-1', async (route) => {
      postCalled = true;
      checkedIn = true; // subsequent next-match reload reflects the validation
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          matchId: 'm-1',
          teamSlot: 1,
          alreadyCheckedIn: false,
          checkedInAt: new Date().toISOString(),
        }),
      });
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/checkin');

    const submit = page.getByRole('button', {
      name: 'Valider le check-in',
    });
    await expect(submit).toBeVisible({ timeout: 10000 });
    await submit.click();

    // A fresh confirmation in THIS session plays the celebratory
    // "just confirmed" state (justConfirmed=true → t.confirmedHeading), which
    // is "Présence confirmée ✓", not the calmer "Check-in validé" recap shown
    // when the page loads an already-checked-in match (see pages/player/checkin.tsx).
    await expect(
      page.getByRole('heading', { name: 'Présence confirmée ✓' })
    ).toBeVisible({ timeout: 10000 });
    expect(postCalled).toBe(true);
  });

  test('window not yet open → waiting state', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      '/api/player/next-match',
      nextMatchPayload({
        token: null,
        alreadyCheckedIn: false,
        checkedInAt: null,
        opensAt: inMinutes(30),
        closesAt: inMinutes(60),
        isOpen: false,
        isPassed: false,
      })
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/checkin');

    await expect(
      page.getByRole('heading', {
        name: "Le check-in n'est pas encore ouvert",
      })
    ).toBeVisible({ timeout: 10000 });
  });
});
