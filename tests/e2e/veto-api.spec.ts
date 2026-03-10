import { test, expect } from '@playwright/test';

const fakeMatchId = '00000000-0000-0000-0000-000000000000';

test.describe('Veto API protection (sans auth)', () => {
  test('GET /api/admin/matches/[matchId]/veto returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`/api/admin/matches/${fakeMatchId}/veto`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/matches/[matchId]/veto returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`/api/admin/matches/${fakeMatchId}/veto`, {
      data: { action: 'ban', map_name: 'Busan', team_id: null },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/admin/matches/[matchId]/veto returns 401/403 without auth', async ({ request }) => {
    const res = await request.delete(`/api/admin/matches/${fakeMatchId}/veto`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/matches/[matchId]/veto returns 401/403 with invalid token', async ({ request }) => {
    const res = await request.get(`/api/admin/matches/${fakeMatchId}/veto`, {
      headers: { Authorization: 'Bearer invalid_token_xyz123' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('Veto page protection', () => {
  test('GET /admin/tournament/fake-id/veto redirige vers login', async ({ page }) => {
    await page.goto('/admin/tournament/00000000-0000-0000-0000-000000000000/veto');
    await page.waitForTimeout(1000);
    const url = page.url();
    const redirected = url.includes('/admin/login') || url.includes('/403');
    expect(
      redirected,
      `La page veto devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe('Map stats API (public)', () => {
  test('GET /api/maps/stats without tournamentId returns 400', async ({ request }) => {
    const res = await request.get('/api/maps/stats');
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('tournamentId');
  });

  test('GET /api/maps/stats with fake tournamentId returns empty', async ({ request }) => {
    const fakeTournamentId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`/api/maps/stats?tournamentId=${fakeTournamentId}`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.totalGames).toBe(0);
    expect(json.maps).toEqual([]);
  });

  test('POST /api/maps/stats returns 405', async ({ request }) => {
    const res = await request.post('/api/maps/stats', {
      data: { tournamentId: 'test' },
    });
    expect(res.status()).toBe(405);
  });
});
