import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';
import slugify from 'slugify';

const BASE_NAME = `E2E Tournament ${Date.now()}`;

test.describe('Admin tournament CRUD (direct supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant pour les tournois');

  test('Créer, éditer, supprimer un tournoi', async () => {
    if (!supabaseTestClient) return;

    // Create
    const slug = slugify(BASE_NAME, { lower: true, strict: true });
    const { data: created, error: createErr } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: BASE_NAME,
        slug,
        status: 'draft',
        game: 'Overwatch',
      })
      .select('id, name, slug, status')
      .maybeSingle();

    expect(createErr).toBeNull();
    expect(created?.id).toBeTruthy();
    const tournamentId = created!.id;

    // Update
    const newName = `${BASE_NAME} Updated`;
    const { data: updated, error: updateErr } = await supabaseTestClient
      .from('tournaments')
      .update({ name: newName, status: 'published' })
      .eq('id', tournamentId)
      .select('id, name, status')
      .maybeSingle();

    expect(updateErr).toBeNull();
    expect(updated?.name).toBe(newName);
    expect(updated?.status).toBe('published');

    // Delete
    const { error: delErr } = await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    expect(delErr).toBeNull();

    const { data: check, error: checkErr } = await supabaseTestClient
      .from('tournaments')
      .select('id')
      .eq('id', tournamentId)
      .maybeSingle();
    expect(checkErr).toBeNull();
    expect(check).toBeNull();
  });
});
