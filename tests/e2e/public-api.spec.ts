import { test, expect } from '@playwright/test';

test.describe('Public API - JSON responses', () => {
  test('GET /api/news returns JSON array', async ({ request }) => {
    const response = await request.get('/api/news');
    expect(response.status()).toBeLessThan(400);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('json');
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/teams returns JSON array', async ({ request }) => {
    const response = await request.get('/api/teams');
    expect(response.status()).toBeLessThan(400);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('json');
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/tournaments returns JSON array', async ({ request }) => {
    const response = await request.get('/api/tournaments');
    expect(response.status()).toBeLessThan(400);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/announcements returns JSON array', async ({ request }) => {
    const response = await request.get('/api/announcements');
    expect(response.status()).toBeLessThan(400);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/partners returns JSON array', async ({ request }) => {
    const response = await request.get('/api/partners');
    expect(response.status()).toBeLessThan(400);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/cast-members returns JSON array', async ({ request }) => {
    const response = await request.get('/api/cast-members');
    expect(response.status()).toBeLessThan(400);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/site-settings returns JSON object', async ({ request }) => {
    const response = await request.get('/api/site-settings');
    expect(response.status()).toBeLessThan(400);
    const body = await response.json();
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });
});

test.describe('Public API - Method restrictions', () => {
  test('POST /api/contact without body returns 4xx', async ({ request }) => {
    const response = await request.post('/api/contact');
    // Should reject invalid request body
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST /api/contact with invalid email returns 4xx', async ({
    request,
  }) => {
    const response = await request.post('/api/contact', {
      data: {
        name: 'Test',
        email: 'not-an-email',
        subject: 'Test',
        message: 'This is a test message for validation',
      },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('POST /api/partnership-requests without body returns 4xx', async ({
    request,
  }) => {
    const response = await request.post('/api/partnership-requests');
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Public API - RSS feed', () => {
  test('GET /api/news/rss returns XML', async ({ request }) => {
    const response = await request.get('/api/news/rss');
    expect(response.status()).toBeLessThan(400);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/xml|rss/);
    const body = await response.text();
    expect(body).toContain('<?xml');
  });
});

test.describe('Admin API - Additional protection checks', () => {
  const protectedEndpoints = [
    { method: 'GET' as const, path: '/api/admin/tournament-templates' },
    { method: 'GET' as const, path: '/api/admin/recycle-bin' },
    { method: 'POST' as const, path: '/api/admin/tournaments' },
    { method: 'POST' as const, path: '/api/admin/teams' },
  ];

  for (const { method, path } of protectedEndpoints) {
    test(`${method} ${path} returns 401 or 403 without auth`, async ({
      request,
    }) => {
      const response =
        method === 'GET'
          ? await request.get(path)
          : await request.post(path, { data: {} });
      expect([401, 403]).toContain(response.status());
    });
  }
});
