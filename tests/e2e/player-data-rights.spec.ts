import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestPlayer,
  createTestStaff,
  deleteTestUser,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const PASSWORD = 'TestPassw0rd!';
const PLAYER_EMAIL = 'hirtzvincent+datarights@gmail.com';
const PLAYER_EXPORT_EMAIL = 'hirtzvincent+dataexport@gmail.com';
const STAFF_EMAIL = 'hirtzvincent+staffnodelete@gmail.com';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const skipIfNoServiceRole = () =>
  !process.env.TEST_SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

async function getToken(email: string, password: string): Promise<string> {
  const { data } = await supabaseTestClient!.auth.signInWithPassword({
    email,
    password,
  });
  return data.session!.access_token;
}

test.describe('Player data rights (GDPR)', () => {
  // ─── Unauthenticated access ───

  test.describe('Unauthenticated requests', () => {
    test('GET /api/player/data-export returns 401 without token', async ({ request }) => {
      const resp = await request.get(`${BASE_URL}/api/player/data-export`);
      expect(resp.status()).toBe(401);
    });

    test('GET /api/player/data-export returns 401 with invalid token', async ({ request }) => {
      const resp = await request.get(`${BASE_URL}/api/player/data-export`, {
        headers: { Authorization: 'Bearer invalid_token_xyz' },
      });
      expect(resp.status()).toBe(401);
    });

    test('DELETE /api/player/delete-account returns 401 without token', async ({ request }) => {
      const resp = await request.delete(`${BASE_URL}/api/player/delete-account`);
      expect(resp.status()).toBe(401);
    });

    test('DELETE /api/player/delete-account returns 401 with invalid token', async ({ request }) => {
      const resp = await request.delete(`${BASE_URL}/api/player/delete-account`, {
        headers: { Authorization: 'Bearer invalid_token_xyz' },
      });
      expect(resp.status()).toBe(401);
    });
  });

  // ─── Method not allowed ───

  test.describe('Wrong HTTP methods', () => {
    test('POST /api/player/data-export returns 405', async ({ request }) => {
      const resp = await request.post(`${BASE_URL}/api/player/data-export`);
      expect(resp.status()).toBe(405);
    });

    test('GET /api/player/delete-account returns 405', async ({ request }) => {
      const resp = await request.get(`${BASE_URL}/api/player/delete-account`);
      expect(resp.status()).toBe(405);
    });
  });

  // ─── Data export ───

  test.describe('Data export', () => {
    test.beforeAll(async () => {
      await deleteTestUser(PLAYER_EXPORT_EMAIL);
      await createTestPlayer(PLAYER_EXPORT_EMAIL, PASSWORD);
    });

    test.afterAll(async () => {
      await deleteTestUser(PLAYER_EXPORT_EMAIL);
    });

    test('returns user data as JSON', async ({ request }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      const token = await getToken(PLAYER_EXPORT_EMAIL, PASSWORD);
      const resp = await request.get(`${BASE_URL}/api/player/data-export`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(resp.status()).toBe(200);

      const body = await resp.json();
      expect(body.exported_at).toBeTruthy();
      expect(body.account).toBeDefined();
      expect(body.account.email).toBe(PLAYER_EXPORT_EMAIL);
      expect(body.account.display_name).toBe('Test Player');
      expect(body.team_membership).toBeInstanceOf(Array);
      expect(body.demandes).toBeInstanceOf(Array);

      // Check Content-Disposition header for download
      const disposition = resp.headers()['content-disposition'];
      expect(disposition).toContain('mes-donnees.json');
    });
  });

  // ─── Staff cannot self-delete ───

  test.describe('Staff self-deletion blocked', () => {
    test.beforeAll(async () => {
      await deleteTestStaff(STAFF_EMAIL);
      await createTestStaff(STAFF_EMAIL, PASSWORD, 'manager');
    });

    test.afterAll(async () => {
      await deleteTestStaff(STAFF_EMAIL);
    });

    test('staff member cannot delete own account', async ({ request }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      const token = await getToken(STAFF_EMAIL, PASSWORD);
      const resp = await request.delete(`${BASE_URL}/api/player/delete-account`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(resp.status()).toBe(403);
      const body = await resp.json();
      expect(body.error).toContain('staff');
    });
  });

  // ─── Account deletion ───

  test.describe('Account deletion', () => {
    test.beforeAll(async () => {
      await deleteTestUser(PLAYER_EMAIL);
      await createTestPlayer(PLAYER_EMAIL, PASSWORD);
    });

    test.afterAll(async () => {
      // Cleanup in case test failed before deletion
      await deleteTestUser(PLAYER_EMAIL);
    });

    test('player can delete own account', async ({ request }) => {
      test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

      const token = await getToken(PLAYER_EMAIL, PASSWORD);
      const resp = await request.delete(`${BASE_URL}/api/player/delete-account`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);

      // Verify user no longer exists
      const { data } = await supabaseTestClient!.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });
      const users = (data as any)?.users as { email?: string }[] | undefined;
      const found = users?.find(
        (u) => u.email?.toLowerCase() === PLAYER_EMAIL.toLowerCase()
      );
      expect(found).toBeUndefined();
    });
  });
});
