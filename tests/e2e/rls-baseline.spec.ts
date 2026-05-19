// tests/e2e/rls-baseline.spec.ts
// Couvre P1-A : RLS activée sur les tables métier sensibles. Vérifie
// qu'un client anon ne peut PAS lire ces tables directement — toute
// lecture doit passer par une route API qui utilise supabaseAdmin
// (service_role, bypass RLS).
//
// Tables protégées : teams, team_members, staff, cast_members,
// tournament_stages, scrims.
//
// Les routes API publiques (ex: /api/scrims, /api/teams) continuent à
// fonctionner — elles passent par supabaseAdmin côté serveur.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const HAS_KEYS = Boolean(supabaseUrl && supabaseAnonKey);
const HAS_SUPABASE = Boolean(supabaseTestClient);

// Tables entièrement opaques pour anon (aucune policy SELECT publique).
const FULLY_OPAQUE_TABLES = [
  'team_members',
  'staff',
  'tournament_stages',
] as const;

// Tables avec policy SELECT publique conditionnelle (cf. migration).
// L'anon peut lire les rows "vitrine" mais pas les autres.
const PARTIALLY_PUBLIC_TABLES = ['teams', 'cast_members', 'scrims'] as const;

// Toutes les tables RLS-protected (pour les tests INSERT/service_role).
const RLS_PROTECTED_TABLES = [
  ...FULLY_OPAQUE_TABLES,
  ...PARTIALLY_PUBLIC_TABLES,
] as const;

test.describe.serial('RLS baseline (P1-A)', () => {
  test.skip(!HAS_KEYS, 'Supabase env non configuré');

  test('client anon : SELECT sur tables fully opaque retourne 0 row', async () => {
    const anon = createClient(supabaseUrl, supabaseAnonKey);

    for (const table of FULLY_OPAQUE_TABLES) {
      const { data, error } = await anon.from(table).select('*').limit(1);

      // Supabase + RLS sans policy SELECT : la lib renvoie data=[] avec
      // error=null (filtré par PostgREST). Pas d'erreur 401/403 explicite.
      expect(error, `unexpected error on ${table}`).toBeNull();
      expect(data, `${table} should return no rows for anon`).toEqual([]);
    }
  });

  test('client anon : SELECT sur teams retourne uniquement is_active=true + deleted_at IS NULL', async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // Seed via service_role : 1 row active, 1 row soft-deleted, 1 row inactive.
    const ts = Date.now();
    const { data: seeded } = await supabaseTestClient!
      .from('teams')
      .insert([
        {
          name: `RLS Test Active ${ts}`,
          slug: `rls-test-active-${ts}`,
          is_active: true,
        },
        {
          name: `RLS Test Deleted ${ts}`,
          slug: `rls-test-deleted-${ts}`,
          is_active: true,
          deleted_at: new Date().toISOString(),
        },
        {
          name: `RLS Test Inactive ${ts}`,
          slug: `rls-test-inactive-${ts}`,
          is_active: false,
        },
      ])
      .select('id, slug');
    const seedIds = (seeded ?? []).map((r: { id: string }) => r.id);

    try {
      const anon = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await anon
        .from('teams')
        .select('id, slug, is_active, deleted_at')
        .like('slug', `rls-test-%-${ts}`);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].slug).toBe(`rls-test-active-${ts}`);
    } finally {
      if (seedIds.length > 0) {
        await supabaseTestClient!.from('teams').delete().in('id', seedIds);
      }
    }
  });

  test('client anon : SELECT sur scrims retourne uniquement is_public=true', async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    const ts = Date.now();
    const { data: seeded } = await supabaseTestClient!
      .from('scrims')
      .insert([
        {
          name: `RLS Scrim Public ${ts}`,
          slug: `rls-scrim-public-${ts}`,
          status: 'scheduled',
          is_public: true,
        },
        {
          name: `RLS Scrim Private ${ts}`,
          slug: `rls-scrim-private-${ts}`,
          status: 'draft',
          is_public: false,
        },
      ])
      .select('id, slug');
    const seedIds = (seeded ?? []).map((r: { id: string }) => r.id);

    try {
      const anon = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await anon
        .from('scrims')
        .select('id, slug, is_public')
        .like('slug', `rls-scrim-%-${ts}`);

      expect(data).toHaveLength(1);
      expect(data![0].is_public).toBe(true);
    } finally {
      if (seedIds.length > 0) {
        await supabaseTestClient!.from('scrims').delete().in('id', seedIds);
      }
    }
  });

  test('client anon : INSERT bloqué sur les tables protégées', async () => {
    const anon = createClient(supabaseUrl, supabaseAnonKey);

    // Tentative d'INSERT sur cast_members (table avec contraintes lax)
    // — doit être refusée par RLS. Note : on s'attend à une erreur 401/403
    // ou un retour vide selon la version de PostgREST.
    const { data, error } = await anon
      .from('cast_members')
      .insert({
        name: '__RLS_TEST__ should fail',
        is_active: false,
      })
      .select();

    // Soit error non-null (refus explicite), soit data null/[].
    const blocked = !!error || data === null || data?.length === 0;
    expect(
      blocked,
      'anon INSERT must be blocked (got data=' + JSON.stringify(data) + ')'
    ).toBe(true);
  });

  test('service_role : SELECT fonctionne (bypass RLS)', async () => {
    test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

    // supabaseTestClient utilise le service_role → RLS bypassée.
    for (const table of RLS_PROTECTED_TABLES) {
      const { error } = await supabaseTestClient!
        .from(table)
        .select('*', { count: 'exact', head: true });
      expect(error, `service_role select on ${table} failed`).toBeNull();
    }
  });

  test('routes API publiques fonctionnent toujours (validation indirecte)', async ({
    request,
  }) => {
    // GET /api/scrims (route publique qui passe par supabaseAdmin).
    // Doit retourner 200, peu importe si la liste est vide.
    const res = await request.get('/api/scrims');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.scrims)).toBe(true);
  });
});
