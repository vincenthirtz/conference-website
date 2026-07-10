// E2E : scrim planning (grille de dispos partagée « When2Meet »).
// Parcours complet : l'admin ouvre une grille entre 2 équipes → les 2 capitaines
// + un caster staff peignent leurs dispos → l'admin voit l'overlap et valide un
// créneau commun → un scrims 'scheduled' est matérialisé (source_planning_id).
//
// Comme le reste de la suite, ce spec SÈME sur la DB (service_role) et tape les
// routes HTTP réelles. Skip si l'env Supabase de test n'est pas configuré.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  DEFAULT_TENANT_ID,
  deleteTeamsByName,
  deleteTestUser,
  createTestPlayer,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';
import { planningConfigFromRow } from '../../utils/teams/scrimPlanningConfig';
import {
  slotKey,
  slotKeysForHorizon,
} from '../../utils/teams/scrimPlanningOverlap';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const TS = Date.now();
const PREFIX = `E2E-SCRPLAN-${TS}`;
const CAPT_A_EMAIL = `test-scrplan-captA-${TS}@test.local`;
const CAPT_B_EMAIL = `test-scrplan-captB-${TS}@test.local`;
const STAFF_EMAIL = `test-scrplan-staff-${TS}@test.local`;
const ADMIN_EMAIL = `test-scrplan-admin-${TS}@test.local`;
const PASSWORD = 'TestPassword123!';

async function tokenFor(email: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  return data.session?.access_token ?? null;
}

// Horizon déterministe : demain (Europe/Paris), 3 jours, créneaux 1h, 18h→22h.
function tomorrowYMD(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

test.describe.serial('Scrim planning (grille de dispos)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let adminToken: string | null = null;
  let captAToken: string | null = null;
  let captBToken: string | null = null;
  let staffToken: string | null = null;
  let captAId: string;
  let captBId: string;
  let teamAId: string;
  let teamBId: string;
  let planningId: string;
  let commonSlot: string;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    await deleteTeamsByName([`${PREFIX}%`]);
    for (const e of [CAPT_A_EMAIL, CAPT_B_EMAIL]) await deleteTestUser(e);
    for (const e of [STAFF_EMAIL, ADMIN_EMAIL]) await deleteTestStaff(e);

    const captA = await createTestPlayer(CAPT_A_EMAIL, PASSWORD);
    const captB = await createTestPlayer(CAPT_B_EMAIL, PASSWORD);
    await createTestStaff(STAFF_EMAIL, PASSWORD, 'caster');
    await createTestStaff(ADMIN_EMAIL, PASSWORD, 'admin');
    captAId = captA!.id;
    captBId = captB!.id;

    [adminToken, captAToken, captBToken, staffToken] = await Promise.all([
      tokenFor(ADMIN_EMAIL),
      tokenFor(CAPT_A_EMAIL),
      tokenFor(CAPT_B_EMAIL),
      tokenFor(STAFF_EMAIL),
    ]);

    const { data: teamA } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `${PREFIX}-teamA`,
        captain_id: captAId,
        is_active: true,
        tenant_id: DEFAULT_TENANT_ID,
      })
      .select('id')
      .single();
    teamAId = teamA!.id;
    await supabaseTestClient
      .from('team_members')
      .insert({ team_id: teamAId, user_id: captAId, role: 'player' });

    const { data: teamB } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `${PREFIX}-teamB`,
        captain_id: captBId,
        is_active: true,
        tenant_id: DEFAULT_TENANT_ID,
      })
      .select('id')
      .single();
    teamBId = teamB!.id;
    await supabaseTestClient
      .from('team_members')
      .insert({ team_id: teamBId, user_id: captBId, role: 'player' });
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (planningId) {
      await supabaseTestClient
        .from('scrims')
        .delete()
        .eq('source_planning_id', planningId);
      await supabaseTestClient
        .from('scrim_plannings')
        .delete()
        .eq('id', planningId);
    }
    await deleteTeamsByName([`${PREFIX}%`]);
    for (const e of [CAPT_A_EMAIL, CAPT_B_EMAIL]) await deleteTestUser(e);
    for (const e of [STAFF_EMAIL, ADMIN_EMAIL]) await deleteTestStaff(e);
  });

  // ─── Auth guards ──────────────────────────────────────

  test('admin create : rejeté sans token', async ({ request }) => {
    const res = await request.post('/api/admin/scrim-plannings', {
      data: { team1_id: teamAId, team2_id: teamBId },
    });
    // POST state-changing sans Bearer ni Origin → rejeté au niveau CSRF (403,
    // csrfCheck s'exécute avant l'auth) ; un token invalide donnerait 401. Les
    // deux valident l'intention : la création non authentifiée est bloquée.
    expect([401, 403]).toContain(res.status());
  });

  test('player list : 401 sans token', async ({ request }) => {
    const res = await request.get('/api/teams/scrim-plannings');
    expect(res.status()).toBe(401);
  });

  // ─── Admin crée la grille ─────────────────────────────

  test('admin ouvre une grille entre les 2 équipes', async ({ request }) => {
    expect(adminToken).toBeTruthy();
    const res = await request.post('/api/admin/scrim-plannings', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': `${PREFIX}-create`,
      },
      data: {
        team1_id: teamAId,
        team2_id: teamBId,
        title: `${PREFIX}-grille`,
        game: 'overwatch',
        horizon_start: tomorrowYMD(),
        horizon_days: 3,
        slot_minutes: 60,
        day_start_min: 18 * 60,
        day_end_min: 22 * 60,
        timezone: 'Europe/Paris',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    planningId = body.planning.id;
    expect(body.planning.status).toBe('open');

    // Un créneau commun de la grille (2e jour, 20h) — via le même helper que le prod.
    const cfg = planningConfigFromRow(body.planning);
    const keys = slotKeysForHorizon(cfg);
    expect(keys.length).toBeGreaterThan(0);
    commonSlot = slotKey(cfg, tomorrowYMD(), 20 * 60);
    expect(keys).toContain(commonSlot);
  });

  // ─── Les participants peignent ────────────────────────

  test('capitaine A peint sa dispo (party team1)', async ({ request }) => {
    const res = await request.put(
      `/api/teams/scrim-plannings/${planningId}/availability`,
      {
        headers: { Authorization: `Bearer ${captAToken}` },
        data: { slots: [commonSlot] },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.mySlots).toContain(commonSlot);
  });

  test('capitaine B peint sa dispo (party team2)', async ({ request }) => {
    const res = await request.put(
      `/api/teams/scrim-plannings/${planningId}/availability`,
      {
        headers: { Authorization: `Bearer ${captBToken}` },
        data: { slots: [commonSlot] },
      }
    );
    expect(res.status()).toBe(200);
  });

  test('le staff (caster) peint sa dispo (party staff)', async ({ request }) => {
    const res = await request.put(
      `/api/teams/scrim-plannings/${planningId}/availability`,
      {
        headers: { Authorization: `Bearer ${staffToken}` },
        data: { slots: [commonSlot] },
      }
    );
    expect(res.status()).toBe(200);
  });

  test('un créneau hors grille est rejeté (400)', async ({ request }) => {
    const res = await request.put(
      `/api/teams/scrim-plannings/${planningId}/availability`,
      {
        headers: { Authorization: `Bearer ${captAToken}` },
        data: { slots: ['2020-01-01T03:00:00.000Z'] },
      }
    );
    expect(res.status()).toBe(400);
  });

  // ─── Admin voit l'overlap ─────────────────────────────

  test('admin voit un overlap 3 parties sur le créneau commun', async ({
    request,
  }) => {
    const res = await request.get(`/api/admin/scrim-plannings/${planningId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const cell = body.heatmap[commonSlot];
    expect(cell).toBeTruthy();
    expect(cell.count).toBe(3);
    expect(cell.parties.sort()).toEqual(['staff', 'team1', 'team2']);
  });

  // ─── Admin valide ─────────────────────────────────────

  test('admin valide le créneau → scrim scheduled créé', async ({ request }) => {
    const res = await request.post(
      `/api/admin/scrim-plannings/${planningId}/validate`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Idempotency-Key': `${PREFIX}-validate`,
        },
        data: { slot: commonSlot },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.scrim.status).toBe('scheduled');
    // Postgres resérialise le timestamptz en '+00:00' ; on compare l'INSTANT,
    // pas la représentation textuelle (commonSlot est un '…000Z').
    expect(new Date(body.scrim.scheduled_date).toISOString()).toBe(commonSlot);
    expect(body.scrim.source_planning_id).toBe(planningId);
    expect(body.planning.status).toBe('validated');
    // Overlap complet → pas de warning.
    expect(body.warning).toBeFalsy();
  });

  test('re-valider est idempotent (même scrim, pas de doublon)', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/admin/scrim-plannings/${planningId}/validate`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Idempotency-Key': `${PREFIX}-validate-2`,
        },
        data: { slot: commonSlot },
      }
    );
    expect(res.status()).toBe(201);

    const { data: scrims } = await supabaseTestClient!
      .from('scrims')
      .select('id')
      .eq('source_planning_id', planningId);
    expect((scrims ?? []).length).toBe(1);
  });
});
