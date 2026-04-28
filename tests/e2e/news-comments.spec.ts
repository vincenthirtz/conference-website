import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const baseSlug = 'news-e2e-comment';
const NEWS_SLUG = `${baseSlug}-${Date.now()}`; // unique per run
const COMMENT_CONTENT = `Test commentaire e2e ${Date.now()}`;
const AUTHOR_NAME = 'E2E Bot';

test.describe.serial('News comments', () => {
  let createdNewsId: string | null = null;
  let createdNewsSlug = NEWS_SLUG;

  test.beforeAll(async () => {
    test.skip(!supabaseTestClient, 'Supabase service role manquant');
    const { data, error } = await supabaseTestClient!
      .from('news')
      .insert({
        title: 'News E2E Commentaire',
        slug: createdNewsSlug,
        content: 'Contenu de test pour commentaires e2e.',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id, slug')
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message || 'Impossible de créer la news e2e');
    }
    createdNewsId = data.id;
    createdNewsSlug = data.slug;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !createdNewsId) return;
    await supabaseTestClient
      .from('news_comments')
      .delete()
      .eq('news_id', createdNewsId);
    await supabaseTestClient.from('news').delete().eq('id', createdNewsId);
  });

  test('Ajouter et vérifier un commentaire', async ({ page }) => {
    test.skip(!createdNewsSlug, 'News de test non créée');

    await page.goto(`/news/${createdNewsSlug}`);

    // Wait for the captcha challenge to load (placeholder contains "Combien font")
    const captchaInput = page.getByPlaceholder(/Combien font/);
    await expect(captchaInput).toBeVisible({ timeout: 10000 });

    // Extract the math question from the placeholder and compute the answer
    const placeholder = await captchaInput.getAttribute('placeholder');
    const match = placeholder?.match(/Combien font (.+) \?/);
    expect(match).toBeTruthy();
    const expression = match![1].replace('×', '*').replace('−', '-');
    const answer = String(eval(expression));

    // Saisir commentaire
    await page.getByPlaceholder('Partage ton avis...').fill(COMMENT_CONTENT);
    await page.getByPlaceholder('Nom (optionnel)').fill(AUTHOR_NAME);
    await captchaInput.fill(answer);

    // Publier
    await page.getByRole('button', { name: 'Publier' }).click();

    // Vérifier la présence
    await expect(page.getByText(COMMENT_CONTENT)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(AUTHOR_NAME)).toBeVisible({
      timeout: 10000,
    });
  });
});
