import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

test.describe('Admin announcements pages (sans auth)', () => {
  test('GET /admin/announcements redirige vers login', async ({ page }) => {
    await page.goto('/admin/announcements');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/admin/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/announcements devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });

  test('GET /admin/announcements/new redirige vers login', async ({ page }) => {
    await page.goto('/admin/announcements/new');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/admin/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/announcements/new devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe('Admin announcements CRUD (supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant pour les annonces');

  test('Créer, modifier, supprimer une annonce', async ({ request }) => {
    if (!supabaseTestClient) return;

    const baseTitle = `E2E Annonce ${Date.now()}`;
    const message = 'Message de test e2e pour le bandeau pub';

    // Create
    const { data: created, error: createErr } = await supabaseTestClient
      .from('announcements')
      .insert({
        title: baseTitle,
        message,
        cta_label: 'Voir',
        cta_url: 'https://example.com',
        is_active: true,
      })
      .select('id, title, message, cta_label')
      .maybeSingle();

    expect(createErr).toBeNull();
    expect(created?.id).toBeTruthy();
    const announcementId = created!.id;

    // Update
    const newTitle = `${baseTitle} modifiée`;
    const newMessage = `${message} - update`;
    const { data: updated, error: updateErr } = await supabaseTestClient
      .from('announcements')
      .update({ title: newTitle, message: newMessage })
      .eq('id', announcementId)
      .select('id, title, message')
      .maybeSingle();

    expect(updateErr).toBeNull();
    expect(updated?.title).toBe(newTitle);
    expect(updated?.message).toBe(newMessage);

    // Check public API exposure
    const apiRes = await request.get('/api/announcements?limit=10');
    expect(apiRes.ok()).toBeTruthy();
    const json = await apiRes.json();
    const found = (json.items || []).find(
      (a: any) => a.id === announcementId || a.title === newTitle
    );
    expect(found).toBeTruthy();

    // Delete
    const { error: delErr } = await supabaseTestClient
      .from('announcements')
      .delete()
      .eq('id', announcementId);
    expect(delErr).toBeNull();

    const { data: check, error: checkErr } = await supabaseTestClient
      .from('announcements')
      .select('id')
      .eq('id', announcementId)
      .maybeSingle();
    expect(checkErr).toBeNull();
    expect(check).toBeNull();
  });
});
