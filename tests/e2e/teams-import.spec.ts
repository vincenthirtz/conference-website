/**
 * Tests E2E — Imports d'équipes (CSV + plateformes externes)
 *
 * Couvre :
 *  - POST /api/admin/teams/import-csv : succès, dédoublonnage, validation header,
 *    > MAX_ROWS, inscription optionnelle au tournoi
 *  - POST /api/admin/teams/import-platform : validation source/sourceRef,
 *    400 si clé API manquante (on ne déclenche pas d'appel réseau réel)
 *  - 401/403 sans auth
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `e2e-import-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!42';
const TEAM_PREFIX = `E2EImp-${TS}`;

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getStaffAccessToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

let staffToken: string | null = null;
let tournamentId: string;

test.describe.serial('Teams import E2E (CSV + platform)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    staffToken = await getStaffAccessToken();

    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Import ${TS}`,
        slug: `e2e-import-${TS}`,
        status: 'draft',
        game: 'overwatch',
      })
      .select('id')
      .single();
    tournamentId = t!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    // Cleanup teams created by import
    const { data: teams } = await supabaseTestClient
      .from('teams')
      .select('id')
      .ilike('name', `${TEAM_PREFIX}%`);

    if (teams && teams.length > 0) {
      const ids = teams.map((t: any) => t.id);
      await supabaseTestClient.from('team_members').delete().in('team_id', ids);
      await supabaseTestClient
        .from('tournament_teams')
        .delete()
        .in('team_id', ids);
      await supabaseTestClient.from('teams').delete().in('id', ids);
    }

    // Cleanup ad-hoc API keys we may have written
    await supabaseTestClient
      .from('site_settings')
      .delete()
      .in('key', [
        'toornament_api_key',
        'challonge_api_key',
        'startgg_api_key',
      ]);

    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);

    await deleteTestStaff(STAFF_EMAIL);
  });

  /* =====================================================================
   * /api/admin/teams/import-csv
   * =====================================================================*/

  test.describe('CSV import', () => {
    test('POST sans auth renvoie 401/403', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-csv', {
        data: { csv: 'name\nFoo' },
      });
      expect([401, 403]).toContain(res.status());
    });

    test('rejette un body sans champ csv', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-csv', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {},
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/csv.*requis|requis.*csv/i);
    });

    test('rejette un CSV avec moins de 2 lignes', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-csv', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { csv: 'name' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/au moins un en-tête/);
    });

    test('rejette un CSV sans colonne name', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-csv', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { csv: 'foo,bar\nval1,val2' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/name/i);
    });

    test('rejette un CSV avec plus de 200 lignes', async ({ request }) => {
      const lines = ['name'];
      for (let i = 0; i < 201; i++) lines.push(`${TEAM_PREFIX}-too-${i}`);
      const res = await request.post('/api/admin/teams/import-csv', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { csv: lines.join('\n') },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Maximum 200/);
    });

    test('importe 3 équipes avec rosters et inscrit au tournoi', async ({
      request,
    }) => {
      const csv = [
        'name,short_name,country,joueurs',
        `${TEAM_PREFIX}-Alpha,A1,FR,Alice#1234;Bob#5678`,
        `${TEAM_PREFIX}-Beta,B1,BE,Charlie#9999`,
        `${TEAM_PREFIX}-Gamma,G1,LU,`,
      ].join('\n');

      const res = await request.post('/api/admin/teams/import-csv', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { csv, tournamentId },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.created).toBe(3);
      expect(body.skipped).toBe(0);
      expect(body.teams).toHaveLength(3);

      // DB sanity
      const teamIds = body.teams.map((t: any) => t.id);
      const { data: members } = await supabaseTestClient!
        .from('team_members')
        .select('team_id, battle_tag')
        .in('team_id', teamIds);
      expect(members?.length).toBe(3); // Alice, Bob, Charlie

      const { data: registrations } = await supabaseTestClient!
        .from('tournament_teams')
        .select('team_id')
        .eq('tournament_id', tournamentId)
        .in('team_id', teamIds);
      expect(registrations?.length).toBe(3);
    });

    test('dédoublonne sur ré-import (skipped > 0)', async ({ request }) => {
      const csv = [
        'name',
        `${TEAM_PREFIX}-Alpha`, // déjà créé au test précédent
        `${TEAM_PREFIX}-Delta`, // nouveau
      ].join('\n');

      const res = await request.post('/api/admin/teams/import-csv', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { csv },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.created).toBe(1);
      expect(body.skipped).toBe(1);
      expect(body.errors.length).toBeGreaterThanOrEqual(1);
      expect(body.errors[0].message).toMatch(/existe d/);
    });
  });

  /* =====================================================================
   * /api/admin/teams/import-platform
   * =====================================================================*/

  test.describe('Platform import (validation paths only)', () => {
    test('POST sans auth renvoie 401/403', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-platform', {
        data: { source: 'toornament', sourceRef: '12345' },
      });
      expect([401, 403]).toContain(res.status());
    });

    test('rejette une source invalide', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-platform', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { source: 'lichess', sourceRef: '12345' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Source invalide/);
    });

    test('rejette un sourceRef vide', async ({ request }) => {
      const res = await request.post('/api/admin/teams/import-platform', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { source: 'toornament', sourceRef: '' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/sourceRef/);
    });

    test("renvoie 400 quand la clé API n'est pas configurée", async ({
      request,
    }) => {
      // Make sure the keys are not set
      await supabaseTestClient!
        .from('site_settings')
        .delete()
        .in('key', [
          'toornament_api_key',
          'challonge_api_key',
          'startgg_api_key',
        ]);

      const res = await request.post('/api/admin/teams/import-platform', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { source: 'toornament', sourceRef: '12345' },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Clé API non configurée/);
      expect(body.error).toContain('toornament_api_key');
    });

    test('renvoie 400 quand sourceRef ne peut pas être parsé', async ({
      request,
    }) => {
      // Set a fake API key so we get past the key check
      await supabaseTestClient!.from('site_settings').upsert(
        {
          key: 'toornament_api_key',
          value: 'fake-key',
          description: 'E2E test',
        },
        { onConflict: 'key' }
      );

      const res = await request.post('/api/admin/teams/import-platform', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { source: 'toornament', sourceRef: 'not a tournament url' },
      });

      // Parser throws PlatformImportError(400) which the route forwards as 400.
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Toornament invalide/);
    });
  });
});
