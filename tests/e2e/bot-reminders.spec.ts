/**
 * Tests E2E — Bot reminders feed (GET /api/bot/v1/reminders)
 *
 * - Auth & contrat (toutes envs)
 * - Smoke fonctionnel match_checkin avec seed minimal (skip si pas de
 *   service role Supabase).
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestPlayer,
  createTestStaff,
  deleteTestStaff,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);

test.describe('Bot reminders — auth & contrat', () => {
  test('rejette une requête sans x-api-key', async ({ request }) => {
    const res = await request.get('/api/bot/v1/reminders');
    // 401 si la clé est configurée côté serveur, 500 si elle ne l'est pas.
    expect([401, 500]).toContain(res.status());
  });

  test('rejette une mauvaise x-api-key', async ({ request }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect([401, 500]).toContain(res.status());
  });

  test('refuse les méthodes autres que GET', async ({ request }) => {
    const res = await request.post('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY ?? '' },
    });
    expect(res.status()).toBe(405);
  });

  test('renvoie un payload structuré sur appel authentifié', async ({
    request,
  }) => {
    test.skip(!HAS_KEY, 'BOT_API_KEY manquant');
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.reminders)).toBe(true);
    expect(Array.isArray(body.errors)).toBe(true);
    // Tous les reminders doivent avoir les champs communs.
    for (const r of body.reminders) {
      expect(typeof r.kind).toBe('string');
      expect(['match_checkin', 'tournament_j1', 'cast_briefing']).toContain(
        r.kind
      );
      expect(typeof r.discordUserId).toBe('string');
      expect(typeof r.id).toBe('string');
    }
  });
});

/* =============================================================
 * Smoke fonctionnel : match_checkin reminder
 * ============================================================= */

const TS = Date.now();
const FAKE_DISCORD_ID = `${2_000_000_000_000_000_000n + BigInt(TS % 1_000_000_000)}`;
const CAPTAIN_EMAIL = `bot-reminders-captain-${TS}@test.local`;

let tournamentId: string;
let team1Id: string;
let team2Id: string;
let matchId: string;
let captainAuthId: string;

test.describe.serial('Bot reminders — match_checkin fonctionnel', () => {
  test.skip(
    !HAS_KEY || !HAS_SUPABASE,
    'BOT_API_KEY ou Supabase service role manquant'
  );

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const captain = await createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!');
    captainAuthId = captain!.id;

    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Bot ${TS}`,
        slug: `e2e-bot-${TS}`,
        status: 'running',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Bot Team A ${TS}`,
        slug: `bot-team-a-${TS}`,
        captain_id: captainAuthId,
      })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Bot Team B ${TS}`,
        slug: `bot-team-b-${TS}`,
      })
      .select('id')
      .single();
    team2Id = t2!.id;

    // Match scheduled 30 min from now (inside the 25-35 min window).
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
        scheduled_at: scheduledAt,
        team1_checkin_token: `tok1-${TS}`,
        team2_checkin_token: `tok2-${TS}`,
      })
      .select('id')
      .single();
    matchId = m!.id;

    // Link captain's Discord account.
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: captainAuthId,
      discord_user_id: FAKE_DISCORD_ID,
      discord_username: `bot_test_${TS}`,
    });
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient.from('matches').delete().eq('id', matchId);
    await supabaseTestClient
      .from('teams')
      .delete()
      .in('id', [team1Id, team2Id]);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', captainAuthId);
    await deleteTestUser(CAPTAIN_EMAIL);
  });

  test('retourne un reminder match_checkin pour le capitaine lié', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const mine = body.reminders.filter(
      (r: { kind: string; matchId?: string }) =>
        r.kind === 'match_checkin' && r.matchId === matchId
    );
    expect(mine.length).toBe(1);
    const reminder = mine[0];
    expect(reminder.discordUserId).toBe(FAKE_DISCORD_ID);
    expect(reminder.id).toBe(`${matchId}:team1`);
    expect(typeof reminder.checkinUrl).toBe('string');
    expect(reminder.checkinUrl).toContain(`tok1-${TS}`);
  });

  test('un second appel ne renvoie plus le même reminder (claim atomique)', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const mine = body.reminders.filter(
      (r: { kind: string; matchId?: string }) =>
        r.kind === 'match_checkin' && r.matchId === matchId
    );
    expect(mine.length).toBe(0);

    // Et la colonne anti-dupe doit être renseignée en DB.
    const { data: row } = await supabaseTestClient!
      .from('matches')
      .select('team1_captain_dm_30_sent_at, team2_captain_dm_30_sent_at')
      .eq('id', matchId)
      .maybeSingle();
    expect(row!.team1_captain_dm_30_sent_at).not.toBeNull();
    // team2 n'avait pas de captain → la colonne reste null.
    expect(row!.team2_captain_dm_30_sent_at).toBeNull();
  });
});

/* =============================================================
 * Smoke fonctionnel : tournament_j1 reminder
 *
 * Le claim de l'endpoint marque TOUS les tournois J-1 en un coup —
 * pour éviter de polluer d'autres tournois éventuels (test ou prod),
 * on snapshot leur j1_reminder_sent_at avant et on le restaure après.
 * ============================================================= */

const J1_TS = Date.now() + 1;
const J1_CAPTAIN_EMAIL = `bot-j1-captain-${J1_TS}@test.local`;
const J1_FAKE_DISCORD = `${4_000_000_000_000_000_000n + BigInt(J1_TS % 1_000_000_000)}`;

let j1TournamentId: string;
let j1StageId: string;
let j1TeamId: string;
let j1CaptainAuthId: string;
let j1OtherSnapshot: { id: string; j1_reminder_sent_at: string | null }[] = [];

test.describe.serial('Bot reminders — tournament_j1 fonctionnel', () => {
  test.skip(
    !HAS_KEY || !HAS_SUPABASE,
    'BOT_API_KEY ou Supabase service role manquant'
  );

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Snapshot des autres tournois J-1 non encore marqués pour les restaurer après.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    const { data: others } = await supabaseTestClient
      .from('tournaments')
      .select('id, j1_reminder_sent_at')
      .gte('start_date', `${dateStr}T00:00:00.000Z`)
      .lt('start_date', `${dateStr}T23:59:59.999Z`)
      .is('j1_reminder_sent_at', null);
    j1OtherSnapshot = (others ?? []).map((r) => ({
      id: r.id,
      j1_reminder_sent_at: r.j1_reminder_sent_at,
    }));

    // Captain + Discord link
    const captain = await createTestPlayer(J1_CAPTAIN_EMAIL, 'TestPass123!');
    j1CaptainAuthId = captain!.id;
    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: j1CaptainAuthId,
      discord_user_id: J1_FAKE_DISCORD,
      discord_username: `j1_test_${J1_TS}`,
    });

    // Tournament avec start_date = demain midi UTC
    const startAt = new Date(`${dateStr}T12:00:00.000Z`).toISOString();
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E J1 ${J1_TS}`,
        slug: `e2e-j1-${J1_TS}`,
        status: 'upcoming',
        game: 'Overwatch',
        start_date: startAt,
      })
      .select('id')
      .single();
    j1TournamentId = tour!.id;

    // Stage + team + stage_team
    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: j1TournamentId,
        name: 'Phase J1',
        kind: 'swiss',
        order_index: 0,
      })
      .select('id')
      .single();
    j1StageId = stage!.id;

    const { data: team } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `J1 Team ${J1_TS}`,
        slug: `j1-team-${J1_TS}`,
        captain_id: j1CaptainAuthId,
      })
      .select('id')
      .single();
    j1TeamId = team!.id;

    await supabaseTestClient.from('stage_teams').insert({
      stage_id: j1StageId,
      team_id: j1TeamId,
    });
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    // Restore the j1_reminder_sent_at on tournaments we might have marked.
    for (const snap of j1OtherSnapshot) {
      await supabaseTestClient
        .from('tournaments')
        .update({ j1_reminder_sent_at: snap.j1_reminder_sent_at })
        .eq('id', snap.id);
    }
    await supabaseTestClient
      .from('stage_teams')
      .delete()
      .eq('stage_id', j1StageId);
    await supabaseTestClient.from('teams').delete().eq('id', j1TeamId);
    await supabaseTestClient
      .from('tournament_stages')
      .delete()
      .eq('id', j1StageId);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', j1TournamentId);
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', j1CaptainAuthId);
    await deleteTestUser(J1_CAPTAIN_EMAIL);
  });

  test('retourne un reminder tournament_j1 pour le capitaine lié', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const mine = body.reminders.filter(
      (r: { kind: string; tournamentId?: string }) =>
        r.kind === 'tournament_j1' && r.tournamentId === j1TournamentId
    );
    expect(mine.length).toBe(1);
    expect(mine[0].discordUserId).toBe(J1_FAKE_DISCORD);
    expect(mine[0].id).toBe(`${j1TournamentId}:${j1CaptainAuthId}`);

    // DB : le mark est posé.
    const { data: row } = await supabaseTestClient!
      .from('tournaments')
      .select('j1_reminder_sent_at')
      .eq('id', j1TournamentId)
      .maybeSingle();
    expect(row!.j1_reminder_sent_at).not.toBeNull();
  });

  test('un second appel ne renvoie plus le tournoi (mark per-tournament)', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    const body = await res.json();
    const mine = body.reminders.filter(
      (r: { kind: string; tournamentId?: string }) =>
        r.kind === 'tournament_j1' && r.tournamentId === j1TournamentId
    );
    expect(mine.length).toBe(0);
  });
});

/* =============================================================
 * Smoke fonctionnel : cast_briefing reminder
 * ============================================================= */

const CAST_TS = Date.now() + 2;
const CAST_STAFF_EMAIL = `bot-cast-${CAST_TS}@test.local`;
const CAST_FAKE_DISCORD = `${5_000_000_000_000_000_000n + BigInt(CAST_TS % 1_000_000_000)}`;

let castStaffAuthId: string;
let castMemberId: string;
let castTournamentId: string;
let castTeam1Id: string;
let castTeam2Id: string;
let castMatchId: string;
let castAssignmentId: string;

test.describe.serial('Bot reminders — cast_briefing fonctionnel', () => {
  test.skip(
    !HAS_KEY || !HAS_SUPABASE,
    'BOT_API_KEY ou Supabase service role manquant'
  );

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const caster = await createTestStaff(
      CAST_STAFF_EMAIL,
      'TestPass123!',
      'caster'
    );
    castStaffAuthId = caster!.id;

    await supabaseTestClient.from('user_discord_links').insert({
      auth_user_id: castStaffAuthId,
      discord_user_id: CAST_FAKE_DISCORD,
      discord_username: `cast_test_${CAST_TS}`,
    });

    const { data: cm } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: `E2E Cast ${CAST_TS}`,
        auth_user_id: castStaffAuthId,
        is_active: true,
      })
      .select('id')
      .single();
    castMemberId = cm!.id;

    // Match minimal
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Cast ${CAST_TS}`,
        slug: `e2e-cast-${CAST_TS}`,
        status: 'running',
        game: 'Overwatch',
      })
      .select('id')
      .single();
    castTournamentId = tour!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Cast TA ${CAST_TS}`,
        slug: `cast-ta-${CAST_TS}`,
      })
      .select('id')
      .single();
    castTeam1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Cast TB ${CAST_TS}`,
        slug: `cast-tb-${CAST_TS}`,
      })
      .select('id')
      .single();
    castTeam2Id = t2!.id;

    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: castTournamentId,
        team1_id: castTeam1Id,
        team2_id: castTeam2Id,
        status: 'pending',
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    castMatchId = m!.id;

    // Assignment avec briefing in 30 min
    const briefingAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: a } = await supabaseTestClient
      .from('cast_assignments')
      .insert({
        match_id: castMatchId,
        cast_member_id: castMemberId,
        briefing_at: briefingAt,
      })
      .select('id')
      .single();
    castAssignmentId = a!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('cast_assignments')
      .delete()
      .eq('id', castAssignmentId);
    await supabaseTestClient.from('matches').delete().eq('id', castMatchId);
    await supabaseTestClient
      .from('teams')
      .delete()
      .in('id', [castTeam1Id, castTeam2Id]);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', castTournamentId);
    await supabaseTestClient
      .from('cast_members')
      .delete()
      .eq('id', castMemberId);
    await supabaseTestClient
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', castStaffAuthId);
    await deleteTestStaff(CAST_STAFF_EMAIL);
  });

  test('retourne un reminder cast_briefing pour le caster lié', async ({
    request,
  }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const mine = body.reminders.filter(
      (r: { kind: string; id: string }) =>
        r.kind === 'cast_briefing' && r.id === castAssignmentId
    );
    expect(mine.length).toBe(1);
    expect(mine[0].discordUserId).toBe(CAST_FAKE_DISCORD);

    const { data: row } = await supabaseTestClient!
      .from('cast_assignments')
      .select('briefing_reminder_sent_at')
      .eq('id', castAssignmentId)
      .maybeSingle();
    expect(row!.briefing_reminder_sent_at).not.toBeNull();
  });

  test('un second appel ne renvoie plus l’assignment', async ({ request }) => {
    const res = await request.get('/api/bot/v1/reminders', {
      headers: { 'x-api-key': API_KEY! },
    });
    const body = await res.json();
    const mine = body.reminders.filter(
      (r: { kind: string; id: string }) =>
        r.kind === 'cast_briefing' && r.id === castAssignmentId
    );
    expect(mine.length).toBe(0);
  });
});
