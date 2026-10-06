// E2E — tickets de support (onglet « Support » de /admin/moderation ; l'ancienne
// URL /admin/support y redirige), lot A10.
//
//   (a) l'écran s'affiche : l'ancienne URL mène à l'onglet, compteurs + liste ;
//   (b) action principale : ouvrir un ticket et le marquer résolu — le PATCH
//       porte le statut et la note de résolution saisie.
//
// Auth = vraie connexion admin (onglet réservé admin+) ; routes support
// mockées, aucun ticket réel touché.

import { test, expect } from '@playwright/test';
import {
  loginStaff,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';
import {
  STAFF_PASSWORD,
  captureJson,
  dismissNextDevOverlay,
  mockActiveTenant,
  mockJson,
} from './_helpers/adminScreenMocks';
import { createTestStaff, deleteTestStaff } from '../utils/supabaseTestClient';

const ADMIN_EMAIL = perWorker('hirtzvincent+e2e-support@gmail.com');

const TICKET = {
  id: '55555555-5555-4555-8555-555555555555',
  tournament_id: null,
  reporter_name: 'Joueuse E2E',
  reporter_email: null,
  is_anonymous: false,
  category: 'technical',
  severity: 'high',
  subject: 'Lobby introuvable E2E',
  message: 'Impossible de rejoindre le lobby du match.',
  status: 'open',
  resolved_at: null,
  resolution_note: null,
  source: 'web',
  discord_user_id: null,
  discord_username: null,
  reported_target_type: null,
  reported_target_name: null,
  reported_battle_tag: null,
  converted_player_blacklist_id: null,
  converted_entity_blacklist_id: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

test.describe('Admin — Support', () => {
  test.beforeAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
    await createTestStaff(ADMIN_EMAIL, STAFF_PASSWORD, 'admin');
  });

  test.afterAll(async () => {
    if (skipIfNoServiceRole()) return;
    await deleteTestStaff(ADMIN_EMAIL);
  });

  test('liste les tickets et en résout un', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');

    await mockActiveTenant(page);
    await mockJson(page, '/api/admin/support/tickets', {
      assignment_available: false,
      tickets: [TICKET],
      total: 1,
      counts: { total: 1, open: 1, high_severity: 1, resolved: 0 },
    });
    const update = await captureJson(
      page,
      `/api/admin/support/tickets/${TICKET.id}`,
      {
        ticket: {
          ...TICKET,
          status: 'resolved',
          resolved_at: '2026-10-06T10:00:00.000Z',
          resolution_note: 'Lobby recréé.',
        },
        notification: null,
      },
      { method: 'PATCH' }
    );

    await loginStaff(page, ADMIN_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/support');
    await page.waitForURL(/\/admin\/moderation\?.*tab=support/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole('heading', { name: 'Tickets de support' })
    ).toBeVisible({ timeout: 15000 });
    await dismissNextDevOverlay(page);

    await page.getByRole('button', { name: /Lobby introuvable E2E/ }).click();
    await expect(page.getByText(TICKET.message)).toBeVisible();

    await page
      .getByPlaceholder('Action prise, contexte...')
      .fill('Lobby recréé.');
    await page.getByRole('button', { name: 'Marquer résolu' }).click();

    await expect.poll(() => update.requests.length).toBe(1);
    expect(update.requests[0].body).toMatchObject({
      status: 'resolved',
      resolution_note: 'Lobby recréé.',
    });
    await expect(page.getByText('Ticket mis à jour')).toBeVisible();
  });
});
