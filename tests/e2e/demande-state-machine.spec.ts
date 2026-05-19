// tests/e2e/demande-state-machine.spec.ts
// Couvre P0-B : state machine sur les transitions de status des demandes.
//   - pending → approved/rejected/cancelled : OK
//   - terminal → terminal différent : 409 INVALID_DEMANDE_TRANSITION
//   - terminal → pending (reset admin) : OK
//   - batch : refuse tout le lot si au moins une transition invalide

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  createTestPlayer,
  deleteTestStaff,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `hirtzvincent+e2e-demande-sm-${TS}@gmail.com`;
const PLAYER_EMAIL = `e2e-demande-sm-player-${TS}@test.local`;
const PASSWORD = 'TestPassw0rd!42';
const COMMENT_TAG = `__E2E_DEMANDE_SM_${TS}__`;

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

type Seeded = { id: string; status: string };

async function seedDemande(
  playerId: string,
  status: string
): Promise<Seeded> {
  const { data } = await supabaseTestClient!
    .from('demandes')
    .insert({
      type: 'other',
      status,
      user_id: playerId,
      source: 'website',
      comment: `${COMMENT_TAG} ${status}`,
    })
    .select('id, status')
    .single();
  return data as Seeded;
}

test.describe.serial('Demande state machine (P0-B)', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let token: string | null = null;
  let playerId: string | null = null;

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(STAFF_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);

    await createTestStaff(STAFF_EMAIL, PASSWORD, 'admin');
    const player = await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    playerId = player?.id ?? null;
    expect(playerId).toBeTruthy();

    token = await getToken();
    expect(token).toBeTruthy();
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient
      .from('demandes')
      .delete()
      .like('comment', `${COMMENT_TAG}%`);
    await deleteTestStaff(STAFF_EMAIL);
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('pending → approved : OK', async ({ request }) => {
    const d = await seedDemande(playerId!, 'pending');
    const res = await request.post('/api/admin/demandes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'updateStatus',
        demandeIds: [d.id],
        newStatus: 'approved',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('approved → cancelled : 409 INVALID_DEMANDE_TRANSITION', async ({
    request,
  }) => {
    const d = await seedDemande(playerId!, 'approved');
    const res = await request.post('/api/admin/demandes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'updateStatus',
        demandeIds: [d.id],
        newStatus: 'cancelled',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('INVALID_DEMANDE_TRANSITION');
    expect(body.invalidTransitions).toHaveLength(1);
    expect(body.invalidTransitions[0].fromStatus).toBe('approved');
  });

  test('rejected → approved : 409', async ({ request }) => {
    const d = await seedDemande(playerId!, 'rejected');
    const res = await request.post('/api/admin/demandes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'updateStatus',
        demandeIds: [d.id],
        newStatus: 'approved',
      },
    });
    expect(res.status()).toBe(409);
  });

  test('cancelled → pending (reset admin) : OK', async ({ request }) => {
    const d = await seedDemande(playerId!, 'cancelled');
    const res = await request.post('/api/admin/demandes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'updateStatus',
        demandeIds: [d.id],
        newStatus: 'pending',
      },
    });
    expect(res.status()).toBe(200);
  });

  test('batch mixte : 1 transition invalide → tout le lot refusé', async ({
    request,
  }) => {
    const ok = await seedDemande(playerId!, 'pending');
    const bad = await seedDemande(playerId!, 'approved');

    const res = await request.post('/api/admin/demandes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'updateStatus',
        demandeIds: [ok.id, bad.id],
        newStatus: 'rejected',
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('INVALID_DEMANDE_TRANSITION');
    expect(body.invalidTransitions).toHaveLength(1);
    expect(body.invalidTransitions[0].id).toBe(bad.id);

    // Vérifie que `ok` (pending au moment du fetch) n'a PAS été modifié non plus
    // — c'est la promesse "all-or-nothing".
    const { data: okAfter } = await supabaseTestClient!
      .from('demandes')
      .select('status')
      .eq('id', ok.id)
      .single();
    expect(okAfter!.status).toBe('pending');
  });

  test('même statut (idempotence) : approved → approved : OK', async ({
    request,
  }) => {
    const d = await seedDemande(playerId!, 'approved');
    const res = await request.post('/api/admin/demandes', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        action: 'updateStatus',
        demandeIds: [d.id],
        newStatus: 'approved',
      },
    });
    expect(res.status()).toBe(200);
  });
});
