/**
 * Tests E2E — Workflows admin critiques
 *
 * Couvre via les vraies routes API (avec auth staff) :
 *  1. Création de tournoi (POST /api/admin/tournaments)
 *  2. Saisie de scores (PUT /api/admin/matches/[matchId] mode score)
 *  3. Génération de bracket + propagation complète
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
const STAFF_EMAIL = `e2e-admin-wf-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Obtenir un access_token valide pour un staff via signInWithPassword.
 * On utilise le client anon (pas le service role) pour simuler un vrai login.
 */
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
 * Setup / Teardown global
 * ---------------------------------------------------------*/

// IDs à nettoyer
let staffToken: string | null = null;
const createdTournamentIds: string[] = [];
const createdTeamIds: string[] = [];

const skip = !supabaseTestClient;

test.describe.serial('Admin workflows E2E (API)', () => {
  test.skip(skip, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Créer un staff admin pour les tests
    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    staffToken = await getStaffAccessToken();
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;

    // Nettoyer les matchs, stages, tournament_maps, tournois, équipes
    for (const tid of createdTournamentIds) {
      await supabaseTestClient.from('matches').delete().eq('tournament_id', tid);
      await supabaseTestClient.from('tournament_stages').delete().eq('tournament_id', tid);
      await supabaseTestClient.from('tournament_maps').delete().eq('tournament_id', tid);
      await supabaseTestClient.from('tournaments').delete().eq('id', tid);
    }
    for (const teamId of createdTeamIds) {
      await supabaseTestClient.from('teams').delete().eq('id', teamId);
    }

    await deleteTestStaff(STAFF_EMAIL);
  });

  /* ==========================================================
   * 1. Création de tournoi via l'API admin
   * ========================================================*/

  test.describe('1 — Création de tournoi', () => {
    test('POST /api/admin/tournaments crée un tournoi avec slug auto', async ({
      request,
    }) => {
      expect(staffToken).toBeTruthy();

      const name = `E2E Tournoi ${TS}`;
      const res = await request.post('/api/admin/tournaments', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {
          name,
          game: 'Overwatch',
          status: 'draft',
        },
      });

      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.tournament).toBeTruthy();
      expect(body.tournament.name).toBe(name);
      expect(body.tournament.slug).toBeTruthy();
      expect(body.tournament.status).toBe('draft');
      expect(body.tournament.id).toBeTruthy();

      createdTournamentIds.push(body.tournament.id);
    });

    test('POST /api/admin/tournaments rejette un nom vide', async ({
      request,
    }) => {
      const res = await request.post('/api/admin/tournaments', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { name: '' },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('name');
    });

    test('POST /api/admin/tournaments rejette un slug dupliqué', async ({
      request,
    }) => {
      // Le premier tournoi a déjà été créé ci-dessus avec le même slug
      const name = `E2E Tournoi ${TS}`;
      const res = await request.post('/api/admin/tournaments', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { name, game: 'Overwatch' },
      });

      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('slug');
    });

    test('POST /api/admin/tournaments rejette des dates invalides', async ({
      request,
    }) => {
      const res = await request.post('/api/admin/tournaments', {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {
          name: `E2E Dates ${TS}`,
          start_date: '2026-06-01T00:00:00Z',
          end_date: '2026-05-01T00:00:00Z', // avant start_date
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('start_date');
    });

    test('GET /api/admin/tournaments liste le tournoi créé', async ({
      request,
    }) => {
      const res = await request.get(
        `/api/admin/tournaments?search=E2E+Tournoi+${TS}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.tournaments.length).toBeGreaterThanOrEqual(1);
      expect(body.tournaments[0].name).toContain(`E2E Tournoi ${TS}`);
    });

    test('POST sans auth renvoie 401', async ({ request }) => {
      const res = await request.post('/api/admin/tournaments', {
        data: { name: 'Should Fail' },
      });
      expect([401, 403]).toContain(res.status());
    });
  });

  /* ==========================================================
   * 2. Saisie de scores via l'API admin
   * ========================================================*/

  let scoreTestTournamentId: string;
  let scoreTestTeam1Id: string;
  let scoreTestTeam2Id: string;
  let scoreTestMatchId: string;

  test.describe('2 — Saisie de scores', () => {
    test.beforeAll(async ({ request: _unused }) => {
      if (!supabaseTestClient || !staffToken) return;

      // Créer tournoi via supabase directement (pas besoin de stage pour un match simple)
      const { data: t, error: tErr } = await supabaseTestClient
        .from('tournaments')
        .insert({
          name: `E2E Scores ${TS}`,
          slug: `e2e-scores-${TS}`,
          status: 'running',
          game: 'Overwatch',
        })
        .select('id')
        .maybeSingle();
      if (tErr) throw new Error(`Tournament insert failed: ${tErr.message}`);
      scoreTestTournamentId = t!.id;
      createdTournamentIds.push(scoreTestTournamentId);

      // Créer 2 équipes
      const { data: t1, error: t1Err } = await supabaseTestClient
        .from('teams')
        .insert({ name: `E2E Score A ${TS}`, short_name: `SA${TS}` })
        .select('id')
        .maybeSingle();
      if (t1Err) throw new Error(`Team1 insert failed: ${t1Err.message}`);
      scoreTestTeam1Id = t1!.id;
      createdTeamIds.push(scoreTestTeam1Id);

      const { data: t2, error: t2Err } = await supabaseTestClient
        .from('teams')
        .insert({ name: `E2E Score B ${TS}`, short_name: `SB${TS}` })
        .select('id')
        .maybeSingle();
      if (t2Err) throw new Error(`Team2 insert failed: ${t2Err.message}`);
      scoreTestTeam2Id = t2!.id;
      createdTeamIds.push(scoreTestTeam2Id);

      // Créer un match (stage_id=null est acceptable)
      const { data: m, error: mErr } = await supabaseTestClient
        .from('matches')
        .insert({
          tournament_id: scoreTestTournamentId,
          stage_id: null,
          team1_id: scoreTestTeam1Id,
          team2_id: scoreTestTeam2Id,
          round_number: 1,
          match_format: 'bo3',
          status: 'pending',
          bracket_side: 'wb',
        })
        .select('id')
        .maybeSingle();
      if (mErr) throw new Error(`Match insert failed: ${mErr.message}`);
      scoreTestMatchId = m!.id;
    });

    test('PUT score met à jour le match et calcule le winner', async ({
      request,
    }) => {
      const res = await request.put(
        `/api/admin/matches/${scoreTestMatchId}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            mode: 'score',
            team1Score: 2,
            team2Score: 1,
          },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.updated).toBe(true);
      expect(body.match.team1_score).toBe(2);
      expect(body.match.team2_score).toBe(1);
      expect(body.winnerTeamId).toBe(scoreTestTeam1Id);
      expect(body.match.status).toBe('finished');
    });

    test('PUT score rejette des scores non-entiers', async ({ request }) => {
      const res = await request.put(
        `/api/admin/matches/${scoreTestMatchId}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            mode: 'score',
            team1Score: 1.5,
            team2Score: 0,
          },
        }
      );

      expect(res.status()).toBe(400);
    });

    test('PUT score rejette des scores négatifs', async ({ request }) => {
      const res = await request.put(
        `/api/admin/matches/${scoreTestMatchId}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            mode: 'score',
            team1Score: -1,
            team2Score: 2,
          },
        }
      );

      expect(res.status()).toBe(400);
    });

    test('PUT score rejette un body sans scores', async ({ request }) => {
      const res = await request.put(
        `/api/admin/matches/${scoreTestMatchId}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: { mode: 'score' },
        }
      );

      expect(res.status()).toBe(400);
    });

    test('GET match retourne le détail après scoring', async ({ request }) => {
      const res = await request.get(
        `/api/admin/matches/${scoreTestMatchId}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.match.team1_score).toBe(2);
      expect(body.match.team2_score).toBe(1);
      expect(body.match.winner_team_id).toBe(scoreTestTeam1Id);
      expect(body.match.status).toBe('finished');
    });

    test('PUT meta update modifie les champs planification', async ({
      request,
    }) => {
      const res = await request.put(
        `/api/admin/matches/${scoreTestMatchId}`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            mode: 'meta',
            scheduled_at: '2026-06-15T14:00:00Z',
            stream_url: 'https://twitch.tv/test',
          },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.match.stream_url).toBe('https://twitch.tv/test');
    });
  });

  /* ==========================================================
   * 3. Génération de bracket + propagation
   * ========================================================*/

  let bracketTournamentId: string;
  let bracketStageId: string | null = null;
  const bracketTeamIds: string[] = [];
  let bracketMatchIds: string[] = [];

  test.describe('3 — Bracket & propagation', () => {
    test.beforeAll(async () => {
      if (!supabaseTestClient) return;

      // Tournoi
      const { data: t, error: tErr } = await supabaseTestClient
        .from('tournaments')
        .insert({
          name: `E2E Bracket ${TS}`,
          slug: `e2e-bracket-${TS}`,
          status: 'running',
          game: 'Overwatch',
        })
        .select('id')
        .maybeSingle();
      if (tErr) throw new Error(`Tournament insert failed: ${tErr.message}`);
      bracketTournamentId = t!.id;
      createdTournamentIds.push(bracketTournamentId);

      // Stage via la table réelle (tournament_stages)
      const { data: s, error: sErr } = await supabaseTestClient
        .from('tournament_stages')
        .insert({
          tournament_id: bracketTournamentId,
          name: 'Bracket Principal',
          stage_type: 'bracket',
          order_index: 0,
          is_active: true,
          is_public: true,
        })
        .select('id')
        .maybeSingle();
      if (sErr) throw new Error(`Stage insert failed: ${sErr.message}`);
      bracketStageId = s!.id;

      // 4 équipes
      for (let i = 1; i <= 4; i++) {
        const { data: team } = await supabaseTestClient
          .from('teams')
          .insert({ name: `E2E BT${i} ${TS}`, short_name: `BT${i}${TS}` })
          .select('id')
          .maybeSingle();
        bracketTeamIds.push(team!.id);
        createdTeamIds.push(team!.id);
      }
    });

    test('POST bracket generate crée un bracket de taille 4', async ({
      request,
    }) => {
      const res = await request.post(
        `/api/admin/tournament/${bracketTournamentId}/bracket`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            action: 'generate',
            size: 4,
            bestOf: 3,
            stageId: bracketStageId,
          },
        }
      );

      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // 4 teams => 2 demi-finales + 1 finale = 3 matchs
      expect(body.match_count).toBe(3);
      expect(body.match_ids).toHaveLength(3);
      bracketMatchIds = body.match_ids;
    });

    test('POST bracket save assigne les équipes aux matchs', async ({
      request,
    }) => {
      // Récupérer les matchs ordonnés par round
      const { data: matches } = await supabaseTestClient!
        .from('matches')
        .select('id, round_number')
        .eq('tournament_id', bracketTournamentId)
        .order('round_number', { ascending: true });

      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(3);

      // Round 1 : 2 matchs (demi-finales)
      const semis = matches!.filter((m) => m.round_number === 1);
      expect(semis).toHaveLength(2);

      // Assigner : match 1 = team1 vs team2, match 2 = team3 vs team4
      const res = await request.post(
        `/api/admin/tournament/${bracketTournamentId}/bracket`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            action: 'save',
            matches: [
              { id: semis[0].id, team1_id: bracketTeamIds[0], team2_id: bracketTeamIds[1] },
              { id: semis[1].id, team1_id: bracketTeamIds[2], team2_id: bracketTeamIds[3] },
            ],
          },
        }
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Vérifier les assignations
      const { data: semi1 } = await supabaseTestClient!
        .from('matches')
        .select('team1_id, team2_id')
        .eq('id', semis[0].id)
        .maybeSingle();

      expect(semi1!.team1_id).toBe(bracketTeamIds[0]);
      expect(semi1!.team2_id).toBe(bracketTeamIds[1]);
    });

    test('Score demi-finale 1 propage le winner en finale', async ({
      request,
    }) => {
      const { data: matches } = await supabaseTestClient!
        .from('matches')
        .select('id, round_number, next_match_win_id, next_match_win_slot')
        .eq('tournament_id', bracketTournamentId)
        .order('round_number', { ascending: true });

      const semi1 = matches!.find((m) => m.round_number === 1)!;
      const finale = matches!.find((m) => m.round_number === 2)!;

      // Vérifier que le lien bracket existe
      expect(semi1.next_match_win_id).toBe(finale.id);

      // Saisir le score : team1 (bracketTeamIds[0]) gagne 2-0
      const res = await request.put(`/api/admin/matches/${semi1.id}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {
          mode: 'score',
          team1Score: 2,
          team2Score: 0,
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.winnerTeamId).toBe(bracketTeamIds[0]);

      // Vérifier la propagation : le winner doit apparaître dans la finale
      const { data: finaleAfter } = await supabaseTestClient!
        .from('matches')
        .select('team1_id, team2_id')
        .eq('id', finale.id)
        .maybeSingle();

      // Le winner de semi1 doit être dans le slot correspondant de la finale
      const slotField =
        semi1.next_match_win_slot === 1 ? 'team1_id' : 'team2_id';
      expect(finaleAfter![slotField as keyof typeof finaleAfter]).toBe(
        bracketTeamIds[0]
      );
    });

    test('Score demi-finale 2 propage le winner en finale (2 slots remplis)', async ({
      request,
    }) => {
      const { data: matches } = await supabaseTestClient!
        .from('matches')
        .select('id, round_number, next_match_win_id, next_match_win_slot')
        .eq('tournament_id', bracketTournamentId)
        .order('round_number', { ascending: true });

      const semis = matches!.filter((m) => m.round_number === 1);
      const semi2 = semis[1];
      const finale = matches!.find((m) => m.round_number === 2)!;

      // team3 (bracketTeamIds[2]) gagne 2-1
      const res = await request.put(`/api/admin/matches/${semi2.id}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {
          mode: 'score',
          team1Score: 2,
          team2Score: 1,
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.winnerTeamId).toBe(bracketTeamIds[2]);

      // La finale doit maintenant avoir les deux équipes
      const { data: finaleAfter } = await supabaseTestClient!
        .from('matches')
        .select('team1_id, team2_id')
        .eq('id', finale.id)
        .maybeSingle();

      expect(finaleAfter!.team1_id).not.toBeNull();
      expect(finaleAfter!.team2_id).not.toBeNull();

      // Les deux finalistes doivent être team1 et team3
      const finalTeams = [finaleAfter!.team1_id, finaleAfter!.team2_id].sort();
      const expectedTeams = [bracketTeamIds[0], bracketTeamIds[2]].sort();
      expect(finalTeams).toEqual(expectedTeams);
    });

    test('Score finale termine le bracket', async ({ request }) => {
      const { data: finale } = await supabaseTestClient!
        .from('matches')
        .select('id, team1_id, team2_id')
        .eq('tournament_id', bracketTournamentId)
        .eq('round_number', 2)
        .maybeSingle();

      expect(finale).not.toBeNull();
      expect(finale!.team1_id).not.toBeNull();
      expect(finale!.team2_id).not.toBeNull();

      // team1 de la finale gagne
      const res = await request.put(`/api/admin/matches/${finale!.id}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: {
          mode: 'score',
          team1Score: 3,
          team2Score: 2,
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.updated).toBe(true);
      expect(body.match.status).toBe('finished');
      expect(body.winnerTeamId).toBe(finale!.team1_id);

      // Vérifier que tous les matchs du tournoi sont finished
      const { data: allMatches } = await supabaseTestClient!
        .from('matches')
        .select('status')
        .eq('tournament_id', bracketTournamentId);

      const allFinished = allMatches!.every((m) => m.status === 'finished');
      expect(allFinished).toBe(true);
    });

    test('POST bracket generate rejette une taille invalide', async ({
      request,
    }) => {
      const res = await request.post(
        `/api/admin/tournament/${bracketTournamentId}/bracket`,
        {
          headers: { Authorization: `Bearer ${staffToken}` },
          data: {
            action: 'generate',
            size: 5, // invalide, doit être 4/8/16/32
          },
        }
      );

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('size');
    });
  });
});
