import { test, expect } from '@playwright/test';

test.describe('Page tirage de maps (sans auth → redirect)', () => {
  test('GET /admin/tournament/fake-id/map-draw redirige vers login', async ({
    page,
  }) => {
    await page.goto(
      '/admin/tournament/00000000-0000-0000-0000-000000000000/map-draw'
    );
    await page.waitForTimeout(1000);
    const url = page.url();
    const redirected = url.includes('/login') || url.includes('/403');
    expect(
      redirected,
      `La page map-draw devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe('API map pool protection', () => {
  const fakeTournamentId = '00000000-0000-0000-0000-000000000000';

  test('GET /api/tournament/[id]/maps returns 403 without auth', async ({
    request,
  }) => {
    const res = await request.get(`/api/tournament/${fakeTournamentId}/maps`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/tournament/[id]/maps returns 403 without auth', async ({
    request,
  }) => {
    const res = await request.post(`/api/tournament/${fakeTournamentId}/maps`, {
      data: { map_name: 'Test Map', map_type: 'control' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('PUT /api/tournament/[id]/maps returns 403 without auth', async ({
    request,
  }) => {
    const res = await request.put(`/api/tournament/${fakeTournamentId}/maps`, {
      data: { maps: [] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/tournament/[id]/maps returns 403 without auth', async ({
    request,
  }) => {
    const res = await request.delete(
      `/api/tournament/${fakeTournamentId}/maps`
    );
    expect([401, 403]).toContain(res.status());
  });

  test('PATCH /api/tournament/[id]/maps returns 403 without auth', async ({
    request,
  }) => {
    const res = await request.patch(
      `/api/tournament/${fakeTournamentId}/maps?mapId=fake`,
      {
        data: { map_name: 'Updated' },
      }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/tournament/[id]/maps returns 403 with invalid token', async ({
    request,
  }) => {
    const res = await request.get(`/api/tournament/${fakeTournamentId}/maps`, {
      headers: { Authorization: 'Bearer invalid_token_xyz123' },
    });
    expect([401, 403]).toContain(res.status());
  });
});
