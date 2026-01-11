import { test, expect } from '@playwright/test';

test.describe('Admin API protection', () => {
  const adminEndpoints = [
    { method: 'GET', path: '/api/admin/tournaments' },
    { method: 'GET', path: '/api/admin/teams' },
    { method: 'GET', path: '/api/admin/news' },
    { method: 'GET', path: '/api/admin/users/manage' },
    { method: 'GET', path: '/api/admin/demandes' },
    { method: 'GET', path: '/api/admin/announcements' },
    { method: 'GET', path: '/api/admin/logs' },
    { method: 'GET', path: '/api/admin/me' },
  ];

  for (const endpoint of adminEndpoints) {
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

  test('POST /api/admin/news returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/admin/news', {
      data: { title: 'Test', content: 'Test content' },
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/admin/announcements returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/admin/announcements', {
      data: { content: 'Test announcement' },
    });
    expect(response.status()).toBe(401);
  });

  test('PATCH /api/admin/users/manage returns 401 without auth', async ({ request }) => {
    const response = await request.patch('/api/admin/users/manage', {
      data: { userId: 'test-id', role: 'player' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Public API accessibility', () => {
  test('GET /api/matches returns 200', async ({ request }) => {
    const response = await request.get('/api/matches');
    // Should be accessible (200) or return empty data, not 401/403
    expect(response.status()).toBeLessThan(400);
  });

  test('GET /api/news returns 200', async ({ request }) => {
    const response = await request.get('/api/news');
    expect(response.status()).toBeLessThan(400);
  });

  test('GET /api/teams returns 200', async ({ request }) => {
    const response = await request.get('/api/teams');
    expect(response.status()).toBeLessThan(400);
  });
});
