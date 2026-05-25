/**
 * Tests E2E — Admin cast assignments API
 *
 * Couvre /api/admin/matches/[matchId]/cast-assignments :
 *  - auth (401/403 sans staff)
 *  - GET liste vide / liste après création
 *  - POST validations (castMemberId, briefingAt)
 *  - POST création + 409 sur doublon
 *  - PATCH reprogramme et reset reminder_sent_at
 *  - DELETE supprime
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
const STAFF_EMAIL = `e2e-cast-assign-staff-${TS}@test.local`;
const STAFF_PASSWORD = 'TestPassw0rd!42';
const CASTER_EMAIL = `e2e-cast-assign-caster-${TS}@test.local`;
const CASTER_PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

let staffToken: string | null = null;
let casterAuthId: string;
let castMemberId: string;
let tournamentId: string;
let team1Id: string;
let team2Id: string;
let matchId: string;

test.describe.serial('Admin cast assignments API', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    // Staff admin pour s'authentifier sur les routes /api/admin/*
    await createTestStaff(STAFF_EMAIL, STAFF_PASSWORD, 'admin');
    staffToken = await signIn(STAFF_EMAIL, STAFF_PASSWORD);

    // Caster (staff role='caster') pour avoir un cast_member lié à un user
    const caster = await createTestStaff(
      CASTER_EMAIL,
      CASTER_PASSWORD,
      'caster'
    );
    casterAuthId = caster!.id;

    // Cast member rattaché au caster
    const { data: cm, error: cmErr } = await supabaseTestClient
      .from('cast_members')
      .insert({
        name: `E2E Caster ${TS}`,
        auth_user_id: casterAuthId,
        is_active: true,
      })
      .select('id')
      .single();
    if (cmErr) throw cmErr;
    castMemberId = cm!.id;

    // Tournoi + 2 équipes + 1 match
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `E2E Cast Assign ${TS}`,
        slug: `e2e-cast-assign-${TS}`,
        status: 'running',
        game: 'overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Cast Assign A ${TS}`,
        slug: `cast-assign-a-${TS}`,
      })
      .select('id')
      .single();
    team1Id = t1!.id;

    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Cast Assign B ${TS}`,
        slug: `cast-assign-b-${TS}`,
      })
      .select('id')
      .single();
    team2Id = t2!.id;

    const { data: m } = await supabaseTestClient
      .from('matches')
      .insert({
        tournament_id: tournamentId,
        team1_id: team1Id,
        team2_id: team2Id,
        status: 'pending',
      })
      .select('id')
      .single();
    matchId = m!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('cast_assignments')
      .delete()
      .eq('match_id', matchId);
    await supabaseTestClient.from('matches').delete().eq('id', matchId);
    await supabaseTestClient
      .from('teams')
      .delete()
      .in('id', [team1Id, team2Id]);
    await supabaseTestClient
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    await supabaseTestClient.from('cast_members').delete().eq('id', castMemberId);
    await deleteTestStaff(CASTER_EMAIL);
    await deleteTestStaff(STAFF_EMAIL);
  });

  /* ---------- Auth ---------- */

  test('GET sans token renvoie 401/403', async ({ request }) => {
    const res = await request.get(
      `/api/admin/matches/${matchId}/cast-assignments`
    );
    expect([401, 403]).toContain(res.status());
  });

  /* ---------- GET ---------- */

  test('GET liste vide', async ({ request }) => {
    const res = await request.get(
      `/api/admin/matches/${matchId}/cast-assignments`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.assignments).toEqual([]);
  });

  /* ---------- POST validations ---------- */

  test('POST rejette castMemberId invalide', async ({ request }) => {
    const res = await request.post(
      `/api/admin/matches/${matchId}/cast-assignments`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { castMemberId: 'not-a-uuid', briefingAt: '2026-12-01T15:00:00Z' },
      }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/castMemberId/);
  });

  test('POST rejette briefingAt manquant', async ({ request }) => {
    const res = await request.post(
      `/api/admin/matches/${matchId}/cast-assignments`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { castMemberId },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('POST rejette briefingAt non-parsable', async ({ request }) => {
    const res = await request.post(
      `/api/admin/matches/${matchId}/cast-assignments`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { castMemberId, briefingAt: 'not-a-date' },
      }
    );
    expect(res.status()).toBe(400);
  });

  /* ---------- POST + GET + 409 ---------- */

  let createdAssignmentId: string;

  test('POST crée un assignment', async ({ request }) => {
    const briefingAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await request.post(
      `/api/admin/matches/${matchId}/cast-assignments`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { castMemberId, briefingAt },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.assignment.match_id).toBe(matchId);
    expect(body.assignment.cast_member_id).toBe(castMemberId);
    expect(body.assignment.briefing_reminder_sent_at).toBeNull();
    createdAssignmentId = body.assignment.id;
  });

  test('GET inclut maintenant l’assignment créé', async ({ request }) => {
    const res = await request.get(
      `/api/admin/matches/${matchId}/cast-assignments`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.assignments.length).toBe(1);
    expect(body.assignments[0].cast_member?.name).toContain('E2E Caster');
  });

  test('POST doublon (même caster + match) → 409', async ({ request }) => {
    const briefingAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await request.post(
      `/api/admin/matches/${matchId}/cast-assignments`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { castMemberId, briefingAt },
      }
    );
    expect(res.status()).toBe(409);
  });

  /* ---------- PATCH ---------- */

  test('PATCH reprogramme et reset le reminder flag', async ({ request }) => {
    // Simule un reminder déjà envoyé en base.
    await supabaseTestClient!
      .from('cast_assignments')
      .update({ briefing_reminder_sent_at: new Date().toISOString() })
      .eq('id', createdAssignmentId);

    const newBriefing = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    const res = await request.patch(
      `/api/admin/matches/${matchId}/cast-assignments/${createdAssignmentId}`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { briefingAt: newBriefing },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(new Date(body.assignment.briefing_at).toISOString()).toBe(
      newBriefing
    );
    expect(body.assignment.briefing_reminder_sent_at).toBeNull();
  });

  /* ---------- DELETE ---------- */

  test('DELETE supprime l’assignment', async ({ request }) => {
    const res = await request.delete(
      `/api/admin/matches/${matchId}/cast-assignments/${createdAssignmentId}`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    expect(res.status()).toBe(200);

    const res2 = await request.get(
      `/api/admin/matches/${matchId}/cast-assignments`,
      { headers: { Authorization: `Bearer ${staffToken}` } }
    );
    const body = await res2.json();
    expect(body.assignments).toEqual([]);
  });
});
