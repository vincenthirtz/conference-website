import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';
import slugify from 'slugify';

const TS = Date.now();
const TOURNAMENT_NAME = `E2E MapPool ${TS}`;

let tournamentId: string | null = null;

test.describe('Tournament map pool CRUD (direct supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    const slug = slugify(TOURNAMENT_NAME, { lower: true, strict: true });
    const { data, error } = await supabaseTestClient
      .from('tournaments')
      .insert({ name: TOURNAMENT_NAME, slug, status: 'draft', game: 'Overwatch' })
      .select('id')
      .maybeSingle();
    expect(error).toBeNull();
    tournamentId = data!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !tournamentId) return;
    await supabaseTestClient.from('tournament_maps').delete().eq('tournament_id', tournamentId);
    await supabaseTestClient.from('tournaments').delete().eq('id', tournamentId);
  });

  test('Ajouter une map au pool', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('tournament_maps')
      .insert({
        tournament_id: tournamentId,
        map_name: 'Busan',
        map_type: 'control',
        image_url: 'https://example.com/busan.jpg',
        enabled: true,
        order_index: 0,
      })
      .select('*')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.map_name).toBe('Busan');
    expect(data!.map_type).toBe('control');
    expect(data!.enabled).toBe(true);
  });

  test('Lister les maps du pool', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('tournament_maps')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    expect(data![0].map_name).toBe('Busan');
  });

  test('Ajouter plusieurs maps et vérifier l'ordre', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const mapsToAdd = [
      { map_name: 'Ilios', map_type: 'control', order_index: 1 },
      { map_name: 'King\'s Row', map_type: 'hybrid', order_index: 2 },
      { map_name: 'Dorado', map_type: 'escort', order_index: 3 },
      { map_name: 'Colosseo', map_type: 'push', order_index: 4 },
    ];

    const { error } = await supabaseTestClient
      .from('tournament_maps')
      .insert(mapsToAdd.map((m) => ({ ...m, tournament_id: tournamentId, enabled: true })));

    expect(error).toBeNull();

    const { data } = await supabaseTestClient
      .from('tournament_maps')
      .select('map_name, order_index')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    expect(data!.length).toBe(5);
    expect(data![0].map_name).toBe('Busan');
    expect(data![4].map_name).toBe('Colosseo');
  });

  test('Modifier une map (nom et type)', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: maps } = await supabaseTestClient
      .from('tournament_maps')
      .select('id, map_name')
      .eq('tournament_id', tournamentId)
      .eq('map_name', 'Dorado')
      .maybeSingle();

    expect(maps).not.toBeNull();

    const { data: updated, error } = await supabaseTestClient
      .from('tournament_maps')
      .update({ map_name: 'Havana', map_type: 'escort' })
      .eq('id', maps!.id)
      .select('map_name, map_type')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.map_name).toBe('Havana');
  });

  test('Désactiver une map', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: maps } = await supabaseTestClient
      .from('tournament_maps')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('map_name', 'Ilios')
      .maybeSingle();

    const { data: updated, error } = await supabaseTestClient
      .from('tournament_maps')
      .update({ enabled: false })
      .eq('id', maps!.id)
      .select('enabled')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.enabled).toBe(false);
  });

  test('Filtrer les maps activées uniquement', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('tournament_maps')
      .select('map_name')
      .eq('tournament_id', tournamentId)
      .eq('enabled', true);

    expect(error).toBeNull();
    // Ilios has been disabled, so 4 maps should be enabled
    expect(data!.length).toBe(4);
    expect(data!.every((m: any) => m.map_name !== 'Ilios')).toBe(true);
  });

  test('Supprimer une map individuelle', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: maps } = await supabaseTestClient
      .from('tournament_maps')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('map_name', 'Havana')
      .maybeSingle();

    const { error } = await supabaseTestClient
      .from('tournament_maps')
      .delete()
      .eq('id', maps!.id);

    expect(error).toBeNull();

    const { data: remaining } = await supabaseTestClient
      .from('tournament_maps')
      .select('map_name')
      .eq('tournament_id', tournamentId);

    expect(remaining!.find((m: any) => m.map_name === 'Havana')).toBeUndefined();
  });

  test('Remplacer tout le pool (PUT behavior)', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    // Delete all first
    await supabaseTestClient
      .from('tournament_maps')
      .delete()
      .eq('tournament_id', tournamentId);

    // Insert new set
    const newPool = [
      { map_name: 'Nepal', map_type: 'control', order_index: 0 },
      { map_name: 'Route 66', map_type: 'escort', order_index: 1 },
      { map_name: 'Eichenwalde', map_type: 'hybrid', order_index: 2 },
    ];

    const { error } = await supabaseTestClient
      .from('tournament_maps')
      .insert(newPool.map((m) => ({ ...m, tournament_id: tournamentId, enabled: true })));

    expect(error).toBeNull();

    const { data } = await supabaseTestClient
      .from('tournament_maps')
      .select('map_name')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    expect(data!.length).toBe(3);
    expect(data![0].map_name).toBe('Nepal');
    expect(data![2].map_name).toBe('Eichenwalde');
  });

  test('Supprimer toutes les maps du pool', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { error } = await supabaseTestClient
      .from('tournament_maps')
      .delete()
      .eq('tournament_id', tournamentId);

    expect(error).toBeNull();

    const { data } = await supabaseTestClient
      .from('tournament_maps')
      .select('id')
      .eq('tournament_id', tournamentId);

    expect(data!.length).toBe(0);
  });
});
