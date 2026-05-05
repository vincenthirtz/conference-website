import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

test.describe('Admin pole-members pages (sans auth)', () => {
  test('GET /admin/pole-members redirige vers login', async ({ page }) => {
    await page.goto('/admin/pole-members');
    await page.waitForTimeout(1000);

    const url = page.url();
    expect(
      url.includes('/admin/login') || url.includes('/403'),
      `/admin/pole-members devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });

  test('GET /admin/pole-members/new redirige vers login', async ({ page }) => {
    await page.goto('/admin/pole-members/new');
    await page.waitForTimeout(1000);

    const url = page.url();
    expect(
      url.includes('/admin/login') || url.includes('/403'),
      `/admin/pole-members/new devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe('API pole-members protection', () => {
  test('GET /api/admin/pole-members sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.get('/api/admin/pole-members');
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/pole-members sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.post('/api/admin/pole-members', {
      data: { poleKey: 'direction', name: 'Test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('PATCH /api/admin/pole-members/[id] sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.patch(
      '/api/admin/pole-members/00000000-0000-0000-0000-000000000000',
      { data: { name: 'Hack' } }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/admin/pole-members/[id] sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.delete(
      '/api/admin/pole-members/00000000-0000-0000-0000-000000000000'
    );
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('Pole members CRUD (supabase)', () => {
  test.skip(
    !supabaseTestClient,
    'Supabase service role manquant pour les pole members'
  );

  test('Créer, modifier, supprimer un membre de pôle', async ({ request }) => {
    if (!supabaseTestClient) return;

    const baseName = `E2E Pole Member ${Date.now()}`;

    // Create
    const { data: created, error: createErr } = await supabaseTestClient
      .from('association_pole_members')
      .insert({
        pole_key: 'direction',
        name: baseName,
        title: 'Test Role',
        is_active: true,
        sort_order: 999,
      })
      .select('id, pole_key, name, title')
      .maybeSingle();

    expect(createErr).toBeNull();
    expect(created?.id).toBeTruthy();
    expect(created?.pole_key).toBe('direction');
    const memberId = created!.id;

    // Update (move to another pôle + rename)
    const newName = `${baseName} modifié`;
    const { data: updated, error: updateErr } = await supabaseTestClient
      .from('association_pole_members')
      .update({ name: newName, pole_key: 'communaute' })
      .eq('id', memberId)
      .select('id, pole_key, name')
      .maybeSingle();

    expect(updateErr).toBeNull();
    expect(updated?.name).toBe(newName);
    expect(updated?.pole_key).toBe('communaute');

    // Visible on /association
    const pageRes = await request.get('/association');
    expect(pageRes.ok()).toBeTruthy();
    // ISR may serve a cached page; we don't assert presence, just that the page renders.

    // Delete
    const { error: delErr } = await supabaseTestClient
      .from('association_pole_members')
      .delete()
      .eq('id', memberId);
    expect(delErr).toBeNull();

    const { data: check } = await supabaseTestClient
      .from('association_pole_members')
      .select('id')
      .eq('id', memberId)
      .maybeSingle();
    expect(check).toBeNull();
  });

  test('Le check constraint refuse un pole_key inconnu', async () => {
    if (!supabaseTestClient) return;

    const { data, error } = await supabaseTestClient
      .from('association_pole_members')
      .insert({
        pole_key: 'inexistant',
        name: `E2E Bad Pole ${Date.now()}`,
      })
      .select('id')
      .maybeSingle();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test('Les membres inactifs ne fuitent pas vers la page publique', async ({
    request,
  }) => {
    if (!supabaseTestClient) return;

    const name = `E2E Inactif ${Date.now()}`;
    const { data: created } = await supabaseTestClient
      .from('association_pole_members')
      .insert({
        pole_key: 'tournoi',
        name,
        is_active: false,
        sort_order: 1000,
      })
      .select('id')
      .maybeSingle();

    expect(created?.id).toBeTruthy();

    const pageRes = await request.get('/association');
    expect(pageRes.ok()).toBeTruthy();
    const html = await pageRes.text();
    // Le nom unique ne doit pas apparaître dans le HTML rendu.
    expect(html.includes(name)).toBeFalsy();

    if (created?.id) {
      await supabaseTestClient
        .from('association_pole_members')
        .delete()
        .eq('id', created.id);
    }
  });
});

test.describe('Page association affiche les pôles', () => {
  test('GET /association retourne 200', async ({ page }) => {
    const res = await page.goto('/association');
    expect(res?.status()).toBeLessThan(400);
  });

  test('La section "Les pôles de l\'équipe" est présente', async ({ page }) => {
    await page.goto('/association');

    await expect(
      page.getByRole('heading', { name: /les pôles de l'équipe/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test('Les 4 cartes de pôles sont visibles', async ({ page }) => {
    await page.goto('/association');

    await expect(page.getByText(/direction & admin/i).first()).toBeVisible();
    await expect(page.getByText(/tournoi & arbitrage/i).first()).toBeVisible();
    await expect(page.getByText(/production & cast/i).first()).toBeVisible();
    await expect(page.getByText(/communauté/i).first()).toBeVisible();
  });
});

test.describe('Pôle Production & cast inclut les casteuses', () => {
  test.skip(
    !supabaseTestClient,
    'Supabase service role manquant pour insérer une casteuse de test'
  );

  test('Une casteuse active apparaît dans la carte du pôle production', async ({
    page,
  }) => {
    if (!supabaseTestClient) return;

    const uniqueName = `E2E Caster ${Date.now()}`;
    const { data: created } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: uniqueName,
        title: 'Test Cast',
        is_active: true,
        is_promo: false,
        sort_order: 9999,
      })
      .select('id')
      .maybeSingle();

    expect(created?.id).toBeTruthy();

    try {
      // Bypass ISR: cache-busting query string forces a fresh render in dev/test.
      await page.goto(`/association?_=${Date.now()}`);

      // Le badge dans la carte "Production & cast" doit contenir le nom unique.
      await expect(page.getByText(uniqueName).first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (created?.id) {
        await supabaseTestClient
          .from('cast_members')
          .delete()
          .eq('id', created.id);
      }
    }
  });
});
