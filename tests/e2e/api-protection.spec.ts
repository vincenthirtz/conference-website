import { test, expect } from '@playwright/test';

test.describe('Admin API protection', () => {
  // Endpoints that return 401 when not authenticated
  const endpoints401 = [
    { method: 'GET', path: '/api/admin/tournaments' },
    { method: 'GET', path: '/api/admin/teams' },
    { method: 'GET', path: '/api/admin/users/manage' },
    { method: 'GET', path: '/api/admin/demandes' },
    { method: 'GET', path: '/api/admin/logs' },
    { method: 'GET', path: '/api/admin/me' },
    // Passée au noyau déclaratif : sans session → 401 comme les autres.
    { method: 'GET', path: '/api/admin/news' },
  ];

  // Stage-level endpoints protected by withStaffRoute
  const stageEndpoints = [
    { method: 'GET', path: '/api/admin/stages/fake-id/completion-status' },
    { method: 'GET', path: '/api/admin/stages/fake-id/swiss-status' },
    { method: 'GET', path: '/api/admin/stages/fake-id/groups' },
  ];

  for (const endpoint of stageEndpoints) {
    test(`${endpoint.method} ${endpoint.path} returns 401 or 403 without auth`, async ({
      request,
    }) => {
      const response = await request.get(endpoint.path);
      expect([401, 403]).toContain(response.status());
    });

    test(`${endpoint.method} ${endpoint.path} returns 401 or 403 with invalid token`, async ({
      request,
    }) => {
      const response = await request.get(endpoint.path, {
        headers: {
          Authorization: 'Bearer invalid_token_xyz123',
        },
      });
      expect([401, 403]).toContain(response.status());
    });
  }

  for (const endpoint of endpoints401) {
    test(`${endpoint.method} ${endpoint.path} returns 401 without auth`, async ({
      request,
    }) => {
      const response = await request.get(endpoint.path);
      expect(response.status()).toBe(401);
    });

    test(`${endpoint.method} ${endpoint.path} returns 401 with invalid token`, async ({
      request,
    }) => {
      const response = await request.get(endpoint.path, {
        headers: {
          Authorization: 'Bearer invalid_token_xyz123',
        },
      });
      expect(response.status()).toBe(401);
    });
  }

  // Mutation sans en-tête Origin : la garde CSRF répond 403 avant l'auth.
  test('POST /api/admin/news returns 403 without auth', async ({ request }) => {
    const response = await request.post('/api/admin/news', {
      data: { title: 'Test', content: 'Test content' },
    });
    expect(response.status()).toBe(403);
  });

  test('PATCH /api/admin/users/manage returns 401 without auth', async ({
    request,
  }) => {
    const response = await request.patch('/api/admin/users/manage', {
      // Même origine : sans en-tête Origin, la garde CSRF des mutations
      // répond 403 AVANT l'authentification (utils/staff.ts#csrfCheck).
      headers: { Origin: new URL(test.info().project.use.baseURL!).origin },
      data: { userId: 'test-id', role: 'player' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Public API accessibility', () => {
  test('GET /api/news returns 200', async ({ request }) => {
    const response = await request.get('/api/news');
    expect(response.status()).toBeLessThan(400);
  });

  test('GET /api/teams returns 200', async ({ request }) => {
    const response = await request.get('/api/teams');
    expect(response.status()).toBeLessThan(400);
  });
});
