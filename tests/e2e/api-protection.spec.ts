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
  ];

  // Stage-level endpoints protected by withStaffRoute
  const stageEndpoints = [
    { method: 'GET', path: '/api/admin/stages/fake-id/completion-status' },
    { method: 'GET', path: '/api/admin/stages/fake-id/swiss-status' },
    { method: 'GET', path: '/api/admin/stages/fake-id/groups' },
  ];

  for (const endpoint of stageEndpoints) {
    test(`${endpoint.method} ${endpoint.path} returns 401 or 403 without auth`, async ({ request }) => {
      const response = await request.get(endpoint.path);
      expect([401, 403]).toContain(response.status());
    });

    test(`${endpoint.method} ${endpoint.path} returns 401 or 403 with invalid token`, async ({ request }) => {
      const response = await request.get(endpoint.path, {
        headers: {
          Authorization: 'Bearer invalid_token_xyz123',
        },
      });
      expect([401, 403]).toContain(response.status());
    });
  }

  // Endpoints that return 403 when not authenticated (staff role check)
  const endpoints403 = [
    { method: 'GET', path: '/api/admin/news' },
    { method: 'GET', path: '/api/admin/announcements' },
  ];

  for (const endpoint of endpoints401) {
    test(`${endpoint.method} ${endpoint.path} returns 401 without auth`, async ({ request }) => {
      const response = await request.get(endpoint.path);
      expect(response.status()).toBe(401);
    });

    test(`${endpoint.method} ${endpoint.path} returns 401 with invalid token`, async ({ request }) => {
      const response = await request.get(endpoint.path, {
        headers: {
          Authorization: 'Bearer invalid_token_xyz123',
        },
      });
      expect(response.status()).toBe(401);
    });
  }

  for (const endpoint of endpoints403) {
    test(`${endpoint.method} ${endpoint.path} returns 403 without auth`, async ({ request }) => {
      const response = await request.get(endpoint.path);
      expect(response.status()).toBe(403);
    });

    test(`${endpoint.method} ${endpoint.path} returns 403 with invalid token`, async ({ request }) => {
      const response = await request.get(endpoint.path, {
        headers: {
          Authorization: 'Bearer invalid_token_xyz123',
        },
      });
      expect(response.status()).toBe(403);
    });
  }

  test('POST /api/admin/news returns 403 without auth', async ({ request }) => {
    const response = await request.post('/api/admin/news', {
      data: { title: 'Test', content: 'Test content' },
    });
    expect(response.status()).toBe(403);
  });

  test('POST /api/admin/announcements returns 403 without auth', async ({ request }) => {
    const response = await request.post('/api/admin/announcements', {
      data: { title: 'Test', message: 'Test announcement' },
    });
    expect(response.status()).toBe(403);
  });

  test('PATCH /api/admin/users/manage returns 401 without auth', async ({ request }) => {
    const response = await request.patch('/api/admin/users/manage', {
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
