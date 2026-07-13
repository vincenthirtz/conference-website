// E2E — Player-discovery feature (slice 1)
//   - page /player/discovery ("Réseau joueuses") guarded by usePlayerSession,
//   - the "Réseau" tab in the PlayerTopBar,
//   - the not-discoverable opt-in banner,
//   - the DiscoveryCard master switch on /player/profile,
//   - search filtering / empty state.
//
// Auth uses the SAME harness as the rest of the authenticated player e2e specs
// (player-nav / player-profile): a REAL test player is created via the
// service-role client so a genuine Supabase session is established, and the
// player logs in through the real /login form. Only the /api/player/* DATA
// endpoints are route-mocked, so the UI under test is deterministic and
// independent of the shared PROD-seeded Supabase DB — we do NOT seed any
// opted-in discovery rows on prod (which would pollute the global network).
//
// The single unauthenticated-redirect assertion runs unconditionally (no login
// needed); everything that requires a logged-in session is gated on the
// service-role key, exactly like player-nav.spec.ts / player-profile.spec.ts.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  skipIfNoServiceRole,
  loginPlayer,
  mockApiJson,
} from './_helpers/playerSession';

const PLAYER_EMAIL = `hirtzvincent+playerdiscovery@gmail.com`;

// FR i18n strings under playerDiscovery / playerTopBar.linkLabels — kept in sync
// with lib/i18n/locales/fr.json so the assertions read like the UI.
const T = {
  navLink: 'Réseau',
  pageTitle: 'Réseau joueuses',
  searchLabel: 'Rechercher une joueuse',
  emptyTitle: 'Aucune joueuse trouvée',
  notDiscoverableBanner:
    "Tu n'apparais pas encore dans le réseau — active ta visibilité dans ton profil.",
  notDiscoverableCta: 'Gérer ma visibilité',
  loadMore: 'Charger plus',
  cardTitle: 'Découverte / Réseau joueurs',
  masterAria: 'Activer ma visibilité dans le réseau',
  taglineLabel: 'Accroche',
  saved: 'Préférences enregistrées.',
};

// Shape returned by GET/PUT /api/player/discovery (DiscoveryCardData).
function discoveryCard(over: Record<string, unknown> = {}) {
  return {
    discoverable: false,
    displayName: 'Joueuse Test',
    avatarUrl: null,
    tagline: null,
    showRatings: true,
    showTeams: true,
    optedInAt: null,
    ...over,
  };
}

// Shape returned by GET /api/player/discovery/search.
function searchResponse(players: unknown[]) {
  return {
    players,
    total: players.length,
    limit: 24,
    offset: 0,
  };
}

const SAMPLE_PLAYERS = [
  {
    authUserId: 'disco-user-1',
    displayName: 'Nova Striker',
    avatarUrl: null,
    tagline: 'Support main, dispo le soir.',
    discordUsername: 'nova',
    stats: { games: 42, peakRating: 3120, tenants: 2 },
  },
  {
    authUserId: 'disco-user-2',
    displayName: 'Echo Vanguard',
    avatarUrl: null,
    tagline: null,
    discordUsername: 'echo',
  },
];

// Deterministic mocks for the endpoints the PlayerTopBar polls on every /player
// route, so the fixed top-bar renders instantly without touching the DB.
async function mockBarApis(page: Page) {
  await mockApiJson(page, '/api/player/notifications', {
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
  });
  await mockApiJson(page, '/api/player/push/prefs', { prefs: [] });
  await mockApiJson(page, '/api/player/matches', { team: null, matches: [] });
  await mockApiJson(page, '/api/player/next-match', {
    match: null,
    team: null,
    opponent: null,
    tournament: null,
    checkin: null,
  });
}

test.describe('Player discovery', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  // ---------------------------------------------------------------------------
  // 1. Unauthenticated → redirect to /login with the next param preserved.
  //    Runs unconditionally: no login / service role needed.
  // ---------------------------------------------------------------------------
  test('unauthenticated visit redirects to /login preserving next', async ({
    page,
  }) => {
    await page.goto('/player/discovery');
    await page.waitForURL(/\/login/, { timeout: 15000 });

    const url = new URL(page.url());
    expect(url.pathname).toContain('/login');
    // usePlayerSession is configured with redirectTo '/login?next=/player/discovery'.
    expect(url.searchParams.get('next')).toBe('/player/discovery');
  });

  // ---------------------------------------------------------------------------
  // 2. Authenticated player: page renders, the "Réseau" nav tab routes here,
  //    and when discoverable=true the opt-in banner is absent.
  // ---------------------------------------------------------------------------
  test('signed-in player reaches discovery via the "Réseau" nav tab', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockBarApis(page);
    // Caller already discoverable → no banner.
    await mockApiJson(
      page,
      '/api/player/discovery',
      discoveryCard({ discoverable: true, optedInAt: new Date().toISOString() })
    );
    await mockApiJson(
      page,
      '/api/player/discovery/search',
      searchResponse(SAMPLE_PLAYERS)
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player');

    const bar = page.locator('div.fixed.top-0').first();
    const networkTab = bar.getByRole('link', { name: T.navLink, exact: true });
    await expect(networkTab).toBeVisible({ timeout: 10000 });

    await networkTab.click();
    await page.waitForURL(/\/player\/discovery$/, { timeout: 10000 });

    await expect(
      page.getByRole('heading', { name: T.pageTitle, level: 1 })
    ).toBeVisible({ timeout: 10000 });

    // Search box is present and labelled via i18n (type="search").
    await expect(
      page.getByRole('searchbox', { name: T.searchLabel })
    ).toBeVisible();

    // Discoverable caller → no opt-in banner.
    await expect(page.getByText(T.notDiscoverableBanner)).toHaveCount(0);

    // Results render as a grid of cards linking to /player/[userId].
    await expect(
      page.getByRole('link', { name: /Nova Striker/ })
    ).toHaveAttribute('href', '/player/disco-user-1');
  });

  // ---------------------------------------------------------------------------
  // 3. Not discoverable → opt-in banner visible with a working CTA to /profile.
  // ---------------------------------------------------------------------------
  test('not-discoverable caller sees the opt-in banner with a CTA to /player/profile', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockBarApis(page);
    await mockApiJson(
      page,
      '/api/player/discovery',
      discoveryCard({ discoverable: false })
    );
    await mockApiJson(
      page,
      '/api/player/discovery/search',
      searchResponse(SAMPLE_PLAYERS)
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/discovery');

    await expect(
      page.getByRole('heading', { name: T.pageTitle, level: 1 })
    ).toBeVisible({ timeout: 10000 });

    const banner = page.getByText(T.notDiscoverableBanner);
    await expect(banner).toBeVisible();

    const cta = page.getByRole('link', { name: T.notDiscoverableCta });
    await expect(cta).toHaveAttribute('href', '/player/profile');

    await cta.click();
    await page.waitForURL(/\/player\/profile$/, { timeout: 10000 });
  });

  // ---------------------------------------------------------------------------
  // 4. /player/profile → DiscoveryCard master switch toggles.
  //    We route-mock GET/PUT so NO real discovery row is written to the shared
  //    prod DB (matching the repo norm: state-mutating player specs mock the
  //    write endpoint rather than persisting). We assert the PUT fired, the
  //    switch aria-checked flips, and the tagline editor is revealed.
  // ---------------------------------------------------------------------------
  test('profile DiscoveryCard master switch calls PUT and flips aria-checked', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockBarApis(page);

    let putBody: unknown = null;
    // One handler for both GET (initial, discoverable=false) and PUT (mutation).
    await page.route(
      (url) => url.pathname === '/api/player/discovery',
      async (route) => {
        const req = route.request();
        if (req.method() === 'PUT') {
          putBody = req.postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              discoveryCard({
                discoverable: true,
                optedInAt: new Date().toISOString(),
              })
            ),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(discoveryCard({ discoverable: false })),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/profile');

    const card = page.locator('section').filter({ hasText: T.cardTitle });
    await expect(card.getByRole('heading', { name: T.cardTitle })).toBeVisible({
      timeout: 10000,
    });

    const master = card.getByRole('switch', { name: T.masterAria });
    await expect(master).toHaveAttribute('aria-checked', 'false');

    await master.click();

    // PUT fired with discoverable:true.
    await expect(page.getByText(T.saved)).toBeVisible({ timeout: 10000 });
    expect(putBody).toMatchObject({ discoverable: true });

    // Switch reflects the new state and the tagline editor is revealed.
    await expect(master).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByLabel(T.taglineLabel)).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 5. Search: a nonsense query filters everything out → empty state.
  //    The mock branches on ?q= so the empty state is deterministic and not
  //    dependent on the shared DB contents.
  // ---------------------------------------------------------------------------
  test('search shows results then an empty state for a nonsense query', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockBarApis(page);
    await mockApiJson(
      page,
      '/api/player/discovery',
      discoveryCard({ discoverable: true, optedInAt: new Date().toISOString() })
    );

    const NONSENSE = 'zznonexistentplayer9999';
    await page.route(
      (url) => url.pathname === '/api/player/discovery/search',
      async (route) => {
        const q =
          new URL(route.request().url()).searchParams.get('q')?.trim() ?? '';
        const players = q === NONSENSE ? [] : SAMPLE_PLAYERS;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(searchResponse(players)),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/discovery');

    // Initial (empty query) → results render.
    await expect(page.getByRole('link', { name: /Nova Striker/ })).toBeVisible({
      timeout: 10000,
    });

    // Typing a nonsense query (debounced 300 ms; auto-retrying expect waits).
    await page.getByRole('searchbox', { name: T.searchLabel }).fill(NONSENSE);

    await expect(page.getByText(T.emptyTitle)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /Nova Striker/ })).toHaveCount(
      0
    );
  });
});
