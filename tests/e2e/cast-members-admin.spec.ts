import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

test.describe('Admin cast-members pages (sans auth)', () => {
  test('GET /admin/cast-members redirige vers login', async ({ page }) => {
    await page.goto('/admin/cast-members');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/admin/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/cast-members devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });

  test('GET /admin/cast-members/new redirige vers login', async ({ page }) => {
    await page.goto('/admin/cast-members/new');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/admin/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/cast-members/new devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe('API cast-members protection', () => {
  test('GET /api/admin/cast-members sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.get('/api/admin/cast-members');
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/cast-members sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.post('/api/admin/cast-members', {
      data: { name: 'Test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/cast-members (public) retourne 200', async ({ request }) => {
    const res = await request.get('/api/cast-members');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toHaveProperty('items');
    expect(Array.isArray(json.items)).toBeTruthy();
  });
});

test.describe('Cast members CRUD (supabase)', () => {
  test.skip(
    !supabaseTestClient,
    'Supabase service role manquant pour les cast members'
  );

  test('Créer, modifier, supprimer une casteuse', async ({ request }) => {
    if (!supabaseTestClient) return;

    const baseName = `E2E Casteuse ${Date.now()}`;
    const title = 'Streameuse Test';

    // Create
    const { data: created, error: createErr } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: baseName,
        title,
        city: 'France',
        twitch_url: 'https://www.twitch.tv/test',
        image_url: '/img/test.jpg',
        is_active: true,
        is_promo: false,
        sort_order: 999,
      })
      .select('id, name, title, city')
      .maybeSingle();

    expect(createErr).toBeNull();
    expect(created?.id).toBeTruthy();
    const castMemberId = created!.id;

    // Update
    const newName = `${baseName} modifiée`;
    const newCity = 'Suisse';
    const { data: updated, error: updateErr } = await supabaseTestClient
      .from('cast_members')
      .update({ name: newName, city: newCity })
      .eq('id', castMemberId)
      .select('id, name, city')
      .maybeSingle();

    expect(updateErr).toBeNull();
    expect(updated?.name).toBe(newName);
    expect(updated?.city).toBe(newCity);

    // Check public API exposure
    const apiRes = await request.get('/api/cast-members');
    expect(apiRes.ok()).toBeTruthy();
    const json = await apiRes.json();
    const found = (json.items || []).find(
      (c: any) => c.id === castMemberId || c.name === newName
    );
    expect(found).toBeTruthy();

    // Delete
    const { error: delErr } = await supabaseTestClient
      .from('cast_members')
      .delete()
      .eq('id', castMemberId);
    expect(delErr).toBeNull();

    const { data: check, error: checkErr } = await supabaseTestClient
      .from('cast_members')
      .select('id')
      .eq('id', castMemberId)
      .maybeSingle();
    expect(checkErr).toBeNull();
    expect(check).toBeNull();
  });

  test('Les casteuses inactives ne sont pas visibles via API publique', async ({
    request,
  }) => {
    if (!supabaseTestClient) return;

    const name = `E2E Inactive ${Date.now()}`;

    // Create inactive cast member
    const { data: created, error: createErr } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name,
        title: 'Test Inactive',
        is_active: false,
        sort_order: 1000,
      })
      .select('id')
      .maybeSingle();

    expect(createErr).toBeNull();
    const castMemberId = created!.id;

    // Check NOT in public API
    const apiRes = await request.get('/api/cast-members');
    const json = await apiRes.json();
    const found = (json.items || []).find((c: any) => c.id === castMemberId);
    expect(found).toBeFalsy();

    // Cleanup
    await supabaseTestClient
      .from('cast_members')
      .delete()
      .eq('id', castMemberId);
  });

  test('Le sort_order est respecté', async ({ request }) => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();

    // Create two cast members with specific order
    const { data: first } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: `E2E First ${timestamp}`,
        title: 'First',
        is_active: true,
        sort_order: 1,
      })
      .select('id')
      .maybeSingle();

    const { data: second } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: `E2E Second ${timestamp}`,
        title: 'Second',
        is_active: true,
        sort_order: 2,
      })
      .select('id')
      .maybeSingle();

    // Check order in API
    const apiRes = await request.get('/api/cast-members');
    const json = await apiRes.json();
    const items = json.items || [];

    const firstIndex = items.findIndex((c: any) => c.id === first?.id);
    const secondIndex = items.findIndex((c: any) => c.id === second?.id);

    if (firstIndex !== -1 && secondIndex !== -1) {
      expect(firstIndex).toBeLessThan(secondIndex);
    }

    // Cleanup
    if (first?.id) {
      await supabaseTestClient.from('cast_members').delete().eq('id', first.id);
    }
    if (second?.id) {
      await supabaseTestClient
        .from('cast_members')
        .delete()
        .eq('id', second.id);
    }
  });
});

test.describe('Page association affiche les casteuses', () => {
  test('GET /association retourne 200', async ({ page }) => {
    const res = await page.goto('/association');
    expect(res?.status()).toBeLessThan(400);
  });

  test('La carte du pôle "Production & cast" est présente', async ({ page }) => {
    await page.goto('/association');

    // Casteuses are now merged into the "Production & cast" pole card.
    await expect(page.getByText(/production & cast/i).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
