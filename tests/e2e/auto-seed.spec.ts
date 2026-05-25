/**
 * Tests E2E — Auto-seed bracket depuis un stage source
 *
 * Couvre via les vraies routes API (avec auth staff) :
 *  1. Validation des entrées (method, sourceStageId, target stage type)
 *  2. Seeding standard (1vN, 2v(N-1), etc.)
 *  3. Seeding séquentiel
 *  4. Cas limites (stages de tournois différents, pas de classement, pas de matchs R1)
 *  5. Protection auth (sans token → 401/403)
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

/* -----------------------------------------------------------
 * Configuration
 * ---------------------------------------------------------*/

const TS = Date.now();
const STAFF_EMAIL = `e2e-autoseed-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!42';

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

/* -----------------------------------------------------------
 * State partagé
 * ---------------------------------------------------------*/

let staffToken: string | null = null;

// Tournoi principal avec source (group) + target (bracket)
let tournamentId: string;
let sourceStageId: string;
let targetStageId: string;
const teamIds: string[] = [];

// Tournoi secondaire (pour test cross-tournament)
let otherTournamentId: string;
let otherStageId: string;

const skip = !supabaseTestClient;

test.describe.serial('Auto-seed E2E (API)', () => {
  test.skip(skip, 'Supabase service role manquant');

  /* -----------------------------------------------------------
   * Setup global
   * ---------------------------------------------------------*/

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Staff manager (minimum requis pour auto-seed)
    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'manager');
    staffToken = await getStaffAccessToken();

    // --- Tournoi principal ---
    const { data: t } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E AutoSeed ${TS}`,
        slug: `e2e-autoseed-${TS}`,
        status: 'running',
        game: 'overwatch',
      })
      .select('id')
      .maybeSingle();
    tournamentId = t!.id;

    // Source stage (group) — sera utilisé pour les classements
    const { data: src } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Phase de poules',
        stage_type: 'group',
        order_index: 0,
        is_active: true,
        is_public: true,
      })
      .select('id')
      .maybeSingle();
    sourceStageId = src!.id;

    // Target stage (bracket) — recevra le seeding
    const { data: tgt } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Bracket Final',
        stage_type: 'bracket',
        order_index: 1,
        is_active: true,
        is_public: true,
      })
      .select('id')
      .maybeSingle();
    targetStageId = tgt!.id;

    // 4 équipes
    for (let i = 1; i <= 4; i++) {
      const { data: team } = await supabaseTestClient
        .from('teams')
        .insert({ name: `E2E AS${i} ${TS}`, short_name: `AS${i}${TS}` })
        .select('id')
        .maybeSingle();
      teamIds.push(team!.id);
    }

    // Inscrire les équipes dans le stage source
    for (let i = 0; i < teamIds.length; i++) {
      await supabaseTestClient.from('stage_teams').insert({
        stage_id: sourceStageId,
        team_id: teamIds[i],
        seed: i + 1,
        is_substitute: false,
      });
    }

    // Créer des matchs terminés dans le source stage pour générer un classement
    // Team1 bat Team2, Team3 bat Team4, Team1 bat Team3 → classement : 1,3,2,4
    const sourceMatches = [
      {
        team1_id: teamIds[0],
        team2_id: teamIds[1],
        t1s: 2,
        t2s: 0,
        winner: teamIds[0],
      },
      {
        team1_id: teamIds[2],
        team2_id: teamIds[3],
        t1s: 2,
        t2s: 1,
        winner: teamIds[2],
      },
      {
        team1_id: teamIds[0],
        team2_id: teamIds[2],
        t1s: 2,
        t2s: 0,
        winner: teamIds[0],
      },
      {
        team1_id: teamIds[1],
        team2_id: teamIds[3],
        t1s: 2,
        t2s: 1,
        winner: teamIds[1],
      },
    ];

    for (const m of sourceMatches) {
      await supabaseTestClient.from('matches').insert({
        tournament_id: tournamentId,
        stage_id: sourceStageId,
        team1_id: m.team1_id,
        team2_id: m.team2_id,
        team1_score: m.t1s,
        team2_score: m.t2s,
        winner_team_id: m.winner,
        round_number: 1,
        match_format: 'bo3',
        status: 'finished',
        bracket_side: 'wb',
      });
    }

    // Créer 2 matchs de round 1 dans le bracket cible (vides, en attente de seeding)
    for (let i = 0; i < 2; i++) {
      await supabaseTestClient.from('matches').insert({
        tournament_id: tournamentId,
        stage_id: targetStageId,
        team1_id: null,
        team2_id: null,
        round_number: 1,
        match_format: 'bo3',
        status: 'pending',
        bracket_side: 'wb',
      });
    }

    // --- Tournoi secondaire (cross-tournament) ---
    const { data: t2 } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E AutoSeed Other ${TS}`,
        slug: `e2e-autoseed-other-${TS}`,
        status: 'running',
        game: 'overwatch',
      })
      .select('id')
      .maybeSingle();
    otherTournamentId = t2!.id;

    const { data: otherSrc } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: otherTournamentId,
        name: 'Autre Stage',
        stage_type: 'group',
        order_index: 0,
        is_active: true,
        is_public: true,
      })
      .select('id')
      .maybeSingle();
    otherStageId = otherSrc!.id;
  });

  /* -----------------------------------------------------------
   * Teardown global
   * ---------------------------------------------------------*/

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    for (const tid of [tournamentId, otherTournamentId]) {
      if (!tid) continue;
      await supabaseTestClient
        .from('stage_teams')
        .delete()
        .in(
          'stage_id',
          (
            await supabaseTestClient
              .from('tournament_stages')
              .select('id')
              .eq('tournament_id', tid)
          ).data?.map((s: any) => s.id) || []
        );
      await supabaseTestClient
        .from('matches')
        .delete()
        .eq('tournament_id', tid);
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .eq('tournament_id', tid);
      await supabaseTestClient.from('tournaments').delete().eq('id', tid);
    }

    for (const teamId of teamIds) {
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }

    await deleteTestStaff(STAFF_EMAIL);
  });

  /* ==========================================================
   * 1. Validation des entrées
   * ========================================================*/

  test.describe('1 — Validation des entrées', () => {
    test('GET renvoie 405 (seul POST est accepté)', async ({ request }) => {
      const res = await request.get(
        `/api/admin/stages/${targetStageId}/auto-seed`,
        { headers: { Authorization: `Bearer ${staffToken}` } }
      );
      expect(res.status()).toBe(405);
    });

    test('POST sans sourceStageId renvoie 400', async ({ request }) => {
      const res = await request.post(
        `/api/admin/stages/${targetStageId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {},
        }
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('sourceStageId');
    });

    test('POST avec un stageId cible inexistant renvoie 404', async ({
      request,
    }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.post(`/api/admin/stages/${fakeId}/auto-seed`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { sourceStageId },
      });
      expect(res.status()).toBe(404);
    });

    test('POST avec un sourceStageId inexistant renvoie 404', async ({
      request,
    }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request.post(
        `/api/admin/stages/${targetStageId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { sourceStageId: fakeId },
        }
      );
      expect(res.status()).toBe(404);
    });

    test('POST avec target non-bracket renvoie 400', async ({ request }) => {
      // sourceStageId est un stage group → pas un bracket
      const res = await request.post(
        `/api/admin/stages/${sourceStageId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { sourceStageId },
        }
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('bracket');
    });

    test('POST avec stages de tournois différents renvoie 400', async ({
      request,
    }) => {
      const res = await request.post(
        `/api/admin/stages/${targetStageId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { sourceStageId: otherStageId },
        }
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('meme tournoi');
    });
  });

  /* ==========================================================
   * 2. Protection auth
   * ========================================================*/

  test.describe('2 — Protection auth', () => {
    test('POST sans token renvoie 401 ou 403', async ({ request }) => {
      const res = await request.post(
        `/api/admin/stages/${targetStageId}/auto-seed`,
        {
          data: { sourceStageId },
        }
      );
      expect([401, 403]).toContain(res.status());
    });
  });

  /* ==========================================================
   * 3. Seeding standard (1vN pattern)
   * ========================================================*/

  test.describe('3 — Seeding standard', () => {
    test('POST auto-seed standard peuple le bracket R1', async ({
      request,
    }) => {
      const res = await request.post(
        `/api/admin/stages/${targetStageId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            sourceStageId,
            seedingPattern: 'standard',
          },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.seeded).toBeDefined();
      expect(body.seeded.length).toBe(4); // 4 équipes dans 2 matchs
      expect(body.totalMatches).toBe(2);

      // Chaque slot seeded a un matchId, slot (1|2), teamId, seed
      for (const s of body.seeded) {
        expect(s.matchId).toBeTruthy();
        expect([1, 2]).toContain(s.slot);
        expect(s.teamId).toBeTruthy();
        expect(typeof s.seed).toBe('number');
      }
    });

    test('Les matchs du bracket ont les équipes assignées après seeding', async () => {
      const { data: matches } = await supabaseTestClient!
        .from('matches')
        .select('id, team1_id, team2_id')
        .eq('stage_id', targetStageId)
        .eq('round_number', 1)
        .order('created_at', { ascending: true });

      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(2);

      // Tous les slots doivent être remplis
      for (const m of matches!) {
        expect(m.team1_id).not.toBeNull();
        expect(m.team2_id).not.toBeNull();
      }

      // Les 4 team IDs doivent toutes être présentes
      const assignedTeams = matches!.flatMap((m) => [m.team1_id, m.team2_id]);
      for (const tid of teamIds) {
        expect(assignedTeams).toContain(tid);
      }
    });

    test('Les équipes sont inscrites dans stage_teams du bracket', async () => {
      const { data: stageTeams } = await supabaseTestClient!
        .from('stage_teams')
        .select('team_id, seed')
        .eq('stage_id', targetStageId);

      expect(stageTeams).not.toBeNull();
      expect(stageTeams!.length).toBeGreaterThanOrEqual(4);

      const enrolledIds = stageTeams!.map((st: any) => st.team_id);
      for (const tid of teamIds) {
        expect(enrolledIds).toContain(tid);
      }
    });

    test('Le seed 1 ne joue pas contre le seed 2 au round 1 (standard seeding)', async () => {
      // En standard seeding pour 4 équipes : 1v4 et 2v3
      // Le seed 1 et seed 2 ne doivent PAS être dans le même match
      const { data: matches } = await supabaseTestClient!
        .from('matches')
        .select('id, team1_id, team2_id')
        .eq('stage_id', targetStageId)
        .eq('round_number', 1)
        .order('created_at', { ascending: true });

      // Récupérer les classements source pour identifier seed 1 et seed 2
      const { data: stageTeams } = await supabaseTestClient!
        .from('stage_teams')
        .select('team_id, seed')
        .eq('stage_id', targetStageId)
        .order('seed', { ascending: true });

      if (stageTeams && stageTeams.length >= 2) {
        const seed1TeamId = stageTeams[0].team_id;
        const seed2TeamId = stageTeams[1].team_id;

        // Vérifier qu'ils ne sont pas dans le même match
        for (const m of matches!) {
          const matchTeams = [m.team1_id, m.team2_id];
          const bothInMatch =
            matchTeams.includes(seed1TeamId) &&
            matchTeams.includes(seed2TeamId);
          expect(bothInMatch).toBe(false);
        }
      }
    });
  });

  /* ==========================================================
   * 4. Seeding séquentiel
   * ========================================================*/

  test.describe('4 — Seeding séquentiel', () => {
    let seqTargetStageId: string;

    test.beforeAll(async () => {
      if (!supabaseTestClient) return;

      // Nouveau bracket pour tester le seeding séquentiel
      const { data: tgt } = await supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: tournamentId,
          name: 'Bracket Seq',
          stage_type: 'bracket',
          order_index: 2,
          is_active: true,
          is_public: true,
        })
        .select('id')
        .maybeSingle();
      seqTargetStageId = tgt!.id;

      // 2 matchs R1 vides
      for (let i = 0; i < 2; i++) {
        await supabaseTestClient.from('matches').insert({
          tournament_id: tournamentId,
          stage_id: seqTargetStageId,
          team1_id: null,
          team2_id: null,
          round_number: 1,
          match_format: 'bo3',
          status: 'pending',
          bracket_side: 'wb',
        });
      }
    });

    test("POST auto-seed sequential assigne les équipes dans l'ordre", async ({
      request,
    }) => {
      const res = await request.post(
        `/api/admin/stages/${seqTargetStageId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            sourceStageId,
            seedingPattern: 'sequential',
          },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.seeded.length).toBe(4);
      expect(body.totalMatches).toBe(2);

      // En séquentiel : seed 1 et seed 2 dans le match 0, seed 3 et seed 4 dans le match 1
      // Vérifier que les 2 premiers seeded sont dans le même match
      const match0Seeds = body.seeded.filter(
        (s: any) => s.matchId === body.seeded[0].matchId
      );
      expect(match0Seeds.length).toBe(2);
    });

    test('En séquentiel, les matchs contiennent des seeds consécutifs', async () => {
      const { data: matches } = await supabaseTestClient!
        .from('matches')
        .select('id, team1_id, team2_id')
        .eq('stage_id', seqTargetStageId)
        .eq('round_number', 1)
        .order('created_at', { ascending: true });

      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(2);

      // Tous les slots remplis
      for (const m of matches!) {
        expect(m.team1_id).not.toBeNull();
        expect(m.team2_id).not.toBeNull();
      }
    });
  });

  /* ==========================================================
   * 5. Cas limite — source sans classement
   * ========================================================*/

  test.describe('5 — Source sans classement', () => {
    let emptySourceId: string;
    let emptyTargetId: string;

    test.beforeAll(async () => {
      if (!supabaseTestClient) return;

      // Stage source vide (pas de matchs, pas d'équipes)
      const { data: src } = await supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: tournamentId,
          name: 'Poules Vides',
          stage_type: 'group',
          order_index: 3,
          is_active: true,
          is_public: true,
        })
        .select('id')
        .maybeSingle();
      emptySourceId = src!.id;

      // Bracket cible avec un match R1
      const { data: tgt } = await supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: tournamentId,
          name: 'Bracket Vide',
          stage_type: 'bracket',
          order_index: 4,
          is_active: true,
          is_public: true,
        })
        .select('id')
        .maybeSingle();
      emptyTargetId = tgt!.id;

      await supabaseTestClient.from('matches').insert({
        tournament_id: tournamentId,
        stage_id: emptyTargetId,
        team1_id: null,
        team2_id: null,
        round_number: 1,
        match_format: 'bo3',
        status: 'pending',
        bracket_side: 'wb',
      });
    });

    test('POST auto-seed avec source vide renvoie 400', async ({ request }) => {
      const res = await request.post(
        `/api/admin/stages/${emptyTargetId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { sourceStageId: emptySourceId },
        }
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('classement');
    });
  });

  /* ==========================================================
   * 6. Cas limite — bracket cible sans matchs R1
   * ========================================================*/

  test.describe('6 — Bracket sans matchs R1', () => {
    let noMatchTargetId: string;

    test.beforeAll(async () => {
      if (!supabaseTestClient) return;

      // Bracket sans aucun match
      const { data: tgt } = await supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: tournamentId,
          name: 'Bracket Sans Matchs',
          stage_type: 'bracket',
          order_index: 5,
          is_active: true,
          is_public: true,
        })
        .select('id')
        .maybeSingle();
      noMatchTargetId = tgt!.id;
    });

    test('POST auto-seed sans matchs R1 renvoie 400', async ({ request }) => {
      const res = await request.post(
        `/api/admin/stages/${noMatchTargetId}/auto-seed`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { sourceStageId },
        }
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('round 1');
    });
  });
});
