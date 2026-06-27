// Shared helpers for the authenticated player-area e2e specs.
//
// These specs follow the SAME harness as the rest of tests/e2e:
//   - a REAL test player is created via the service-role client
//     (createTestPlayer) so a genuine Supabase session/cookie is established
//     and usePlayerSession / useAdminFetch resolve it exactly like in prod;
//   - the player logs in through the real /login form (input#email /
//     input#password / button[type=submit]) — identical to auth.spec.ts &
//     password-change.spec.ts;
//   - only the /api/player/* DATA endpoints are route-mocked, so the UI under
//     test is deterministic and independent of DB state.
//
// We deliberately do NOT mock /api/admin/me: the login page calls it and
// relies on the real 403 (non-staff) to route a player to /player.

import type { Page } from '@playwright/test';

export const PLAYER_PASSWORD = 'TestPassw0rd!';

/** True when no service-role key is configured → real login impossible. */
export const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

/**
 * Log a player in through the real /login form and land on `next`.
 * A plain player (role 'player') gets a 403 from /api/admin/me and is routed
 * to `next` (or /player by default).
 */
export async function loginPlayer(
  page: Page,
  email: string,
  next: string,
  password: string = PLAYER_PASSWORD
): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill('input#email', email);
  await page.fill('input#password', password);
  await page.click('button[type="submit"]');
  // Wait until we leave /login for the requested player route.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15000,
  });
}

type JsonMock = Record<string, unknown> | unknown[];

/**
 * Register a JSON route mock for an exact /api/... path (query string ignored).
 * Returns nothing; call before navigating to the page that fetches it.
 */
export async function mockApiJson(
  page: Page,
  pathname: string,
  body: JsonMock,
  status = 200
): Promise<void> {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

/* --------------------------------------------------------------------------
 * Deterministic payload builders matching the API response shapes.
 * (Mirror pages/api/player/matches.ts, next-match.ts, notifications.ts.)
 * ------------------------------------------------------------------------ */

export function inMinutes(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

export type MockMatch = {
  id: string;
  scheduledAt: string | null;
  status: string;
  roundName: string | null;
  format: string | null;
  bestOf: number | null;
  streamUrl: string | null;
  slot: 1 | 2;
  opponent: { id: string; name: string } | null;
  score: { mine: number | null; opponent: number | null } | null;
  result: 'win' | 'loss' | 'draw' | null;
  tournament: { id: string; name: string; slug: string | null } | null;
  checkin: {
    token: string | null;
    alreadyCheckedIn: boolean;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    isPassed: boolean;
  } | null;
};

export function buildMatch(overrides: Partial<MockMatch>): MockMatch {
  return {
    id: 'm-default',
    scheduledAt: inMinutes(60),
    status: 'pending',
    roundName: 'Quart de finale',
    format: 'bo3',
    bestOf: 3,
    streamUrl: null,
    slot: 1,
    opponent: { id: 'opp-default', name: 'Team Adverse' },
    score: null,
    result: null,
    tournament: { id: 't-1', name: 'Conference Cup', slug: 'conference-cup' },
    checkin: null,
    ...overrides,
  };
}
