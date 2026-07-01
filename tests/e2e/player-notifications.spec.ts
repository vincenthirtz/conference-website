// E2E — pages/player/notifications.tsx ("Notifications")
//
//   (a) GET /api/player/notifications → counters: non-zero ones render
//       actionable QuickAction cards; total 0 → "Tout est à jour ✓".
//   (b) GET/PUT /api/player/push/prefs → per-event toggles; flipping a toggle
//       issues a PUT and shows a success toast.
//
// Auth = real player login; both endpoints are route-mocked.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+playernotifs@gmail.com`;

function counters(overrides: Record<string, number> = {}) {
  const base = {
    unreadMessages: 0,
    pendingScrims: 0,
    pendingJoinRequests: 0,
    checkinPending: 0,
    ...overrides,
  };
  const total =
    base.unreadMessages +
    base.pendingScrims +
    base.pendingJoinRequests +
    base.checkinPending;
  return {
    hasTeam: true,
    isCaptain: true,
    isManager: false,
    captainTeamId: 'team-1',
    memberTeamId: 'team-1',
    ...base,
    total,
  };
}

test.describe('Player notifications page', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('non-zero counters render actionable cards with deep links', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(
      page,
      '/api/player/notifications',
      counters({ unreadMessages: 2, checkinPending: 1 })
    );
    await mockApiJson(page, '/api/player/push/prefs', { prefs: [] });

    await loginPlayer(page, PLAYER_EMAIL, '/player/notifications');

    await expect(
      page.getByRole('heading', { name: 'Notifications', level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Messages card → /player/messages, with the unread badge.
    const messagesCard = page.getByRole('link', { name: /Messages non lus/ });
    await expect(messagesCard).toBeVisible();
    await expect(messagesCard).toHaveAttribute('href', '/player/messages');
    await expect(messagesCard.getByText('2')).toBeVisible();

    // Check-in card → /player/checkin.
    const checkinCard = page.getByRole('link', { name: /Check-in à valider/ });
    await expect(checkinCard).toBeVisible();
    await expect(checkinCard).toHaveAttribute('href', '/player/checkin');

    // Zero counters must not render their cards.
    await expect(
      page.getByRole('link', { name: /Demandes de scrim/ })
    ).toHaveCount(0);
  });

  test('total 0 → "Tout est à jour"', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/notifications', counters());
    await mockApiJson(page, '/api/player/push/prefs', { prefs: [] });

    await loginPlayer(page, PLAYER_EMAIL, '/player/notifications');

    await expect(page.getByText(/Tout est à jour/)).toBeVisible({
      timeout: 10000,
    });
  });

  test('flipping a push-preference toggle issues a PUT', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockApiJson(page, '/api/player/notifications', counters());
    // The prefs endpoint returns two per-channel maps (opt-OUT push /
    // opt-IN email) keyed by event_type — NOT an array. `push` defaults to
    // enabled when a key is present with `true`. See NotificationPrefsGrid.
    await mockApiJson(page, '/api/player/push/prefs', {
      push: { 'match.starting': true, 'match.finished': true },
      email: {},
    });

    let putBody: unknown = null;
    await page.route('**/api/player/push/prefs', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
        return;
      }
      await route.fallback();
    });

    await loginPlayer(page, PLAYER_EMAIL, '/player/notifications');

    // The push toggle for match.starting is on → turn it off. Its accessible
    // name is composed as `${channel} — ${label}`, i.e. "Push — Match imminent".
    const toggle = page.getByRole('switch', { name: 'Push — Match imminent' });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();

    // Success toast + correct PUT payload (single-pref shape).
    await expect(page.getByText('Préférence enregistrée.')).toBeVisible({
      timeout: 10000,
    });
    expect(putBody).toMatchObject({
      eventType: 'match.starting',
      channel: 'push',
      enabled: false,
    });
  });
});
