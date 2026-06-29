import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  seedTournament,
  DEFAULT_TENANT_ID,
} from '../utils/supabaseTestClient';
import slugify from 'slugify';

const TS = Date.now();
const TOURNAMENT_NAME = `E2E Stages ${TS}`;

let tournamentId: string | null = null;

test.describe('Tournament stages CRUD (direct supabase)', () => {
  test.skip(!supabaseTestClient, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    const slug = slugify(TOURNAMENT_NAME, { lower: true, strict: true });
    tournamentId = await seedTournament({ name: TOURNAMENT_NAME, slug });
    expect(tournamentId).not.toBeNull();
  });

  test.afterAll(async () => {
    if (!supabaseTestClient || !tournamentId) return;
    await supabaseTestClient
      .from('tournament_stages')
      .delete()
      .eq('tournament_id', tournamentId);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
  });

  test('Créer une stage de type bracket', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data, error } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        tenant_id: DEFAULT_TENANT_ID,
        name: 'Phase de groupes',
        stage_type: 'group',
        order_index: 0,
        is_active: true,
        is_public: false,
      })
      .select('*')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.name).toBe('Phase de groupes');
    expect(data!.stage_type).toBe('group');
    expect(data!.is_active).toBe(true);
  });

  test("Créer plusieurs stages et vérifier l'ordre", async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const stages = [
      { name: 'Bracket principal', stage_type: 'bracket', order_index: 1 },
      { name: 'Losers bracket', stage_type: 'bracket', order_index: 2 },
      { name: 'Grande finale', stage_type: 'showmatch', order_index: 3 },
    ];

    const { error } = await supabaseTestClient.from('tournament_stages').insert(
      stages.map((s) => ({
        ...s,
        tournament_id: tournamentId,
        tenant_id: DEFAULT_TENANT_ID,
        is_active: false,
        is_public: false,
      }))
    );

    expect(error).toBeNull();

    const { data } = await supabaseTestClient
      .from('tournament_stages')
      .select('name, order_index')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });

    expect(data!.length).toBe(4);
    expect(data![0].name).toBe('Phase de groupes');
    expect(data![3].name).toBe('Grande finale');
  });

  test('Modifier une stage', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('name', 'Bracket principal')
      .maybeSingle();

    const { data: updated, error } = await supabaseTestClient
      .from('tournament_stages')
      .update({ name: 'Winners bracket', is_active: true, is_public: true })
      .eq('id', stage!.id)
      .select('name, is_active, is_public')
      .maybeSingle();

    expect(error).toBeNull();
    expect(updated!.name).toBe('Winners bracket');
    expect(updated!.is_active).toBe(true);
    expect(updated!.is_public).toBe(true);
  });

  test('Supprimer une stage', async () => {
    if (!supabaseTestClient || !tournamentId) return;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('name', 'Grande finale')
      .maybeSingle();

    const { error } = await supabaseTestClient
      .from('tournament_stages')
      .delete()
      .eq('id', stage!.id);

    expect(error).toBeNull();

    const { data: remaining } = await supabaseTestClient
      .from('tournament_stages')
      .select('name')
      .eq('tournament_id', tournamentId);

    expect(remaining!.length).toBe(3);
    expect(
      remaining!.find((s: any) => s.name === 'Grande finale')
    ).toBeUndefined();
  });
});
