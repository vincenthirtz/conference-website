// E2E — espace capitaine (/player/manage-team) : les deux décisions à
// conséquence ajoutées aux lots P7/P8.
//
//   1. Demande d'adhésion : motif de refus facultatif + confirmation. Le motif
//      saisi part dans le POST ; annuler la confirmation n'envoie RIEN.
//   2. Roster verrouillé par un tournoi : bandeau (date, tournoi) et
//      « Demander une dérogation » — motif minimal requis, POST, puis l'écran
//      relu affiche la demande en attente à la place du bouton.
//
// VRAIE joueuse connectée ; l'équipe, les demandes et les écritures sont
// simulées (`page.route`) : rien n'est modifié en base. Même harnais que
// manage-team.spec.ts.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import { captureJson, mockJson } from './_helpers/adminScreenMocks';
import {
  PLAYER_PASSWORD,
  loginPlayer,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2ecaptaindecide@gmail.com');
const PAGE = '/player/manage-team';

const TEAM = {
  id: 'team-e2e-decide',
  slug: 'team-e2e-decide',
  name: 'Décisions Squad',
  short_name: 'DEC',
  logo_url: null,
  country: 'FR',
  description: null,
  is_joinable: true,
};
const MEMBERS = [
  {
    id: 'mem-captain',
    user_id: 'user-captain',
    role: 'player',
    battle_tag: 'Capitaine#0001',
    is_substitute: false,
    is_captain: true,
    specialty: 'tank',
  },
  {
    id: 'mem-player',
    user_id: 'user-player',
    role: 'player',
    battle_tag: 'Coequipiere#0002',
    is_substitute: false,
    is_captain: false,
    specialty: 'dps',
  },
];

const CANDIDATE = 'Candidate E2E';
const JOIN_REQUEST = {
  id: 'dem-e2e-candidate',
  user_id: 'user-candidate',
  status: 'pending',
  comment: 'Je joue support depuis deux saisons.',
  payload: { desired_role: 'player' },
  created_at: '2026-09-20T12:00:00.000Z',
  user: {
    id: 'user-candidate',
    email: null,
    display_name: CANDIDATE,
    battle_tag: 'Candidate#4242',
    discord: null,
  },
};

const LOCKED_AT = '2026-09-18T18:00:00.000Z';
const LOCK = {
  locked: true,
  tournamentId: 't-e2e',
  tournamentName: 'Conference Cup',
  lockedAt: LOCKED_AT,
  unlockedUntil: null,
  pendingRequest: null,
};

// lib/i18n/locales/fr/{manageTeam,teamOpening}.ts
const T = {
  reject: 'Refuser',
  reasonLabel: 'Motif du refus (facultatif)',
  confirmTitle: `Refuser la demande de ${CANDIDATE} ?`,
  confirmWithReason: 'Le motif saisi lui sera montré.',
  confirmNo: 'Annuler',
  rejected: 'Demande rejetee',
  lockedTitle: /Roster verrouillé depuis le/,
  lockedBody: '« Conference Cup » a figé les rosters',
  unlockCta: 'Demander une dérogation',
  unlockReason: 'Quel changement, et pourquoi ?',
  unlockSubmit: 'Envoyer la demande',
  unlockPending: /Demande de dérogation envoyée le .* en attente du staff\./,
};

/** Capitaine de l'équipe ; `rosterLock()` est relu à chaque GET. */
async function mockCaptain(
  page: Page,
  opts: { rosterLock?: () => unknown; joinRequests?: unknown[] } = {}
) {
  await page.route(
    (url) => url.pathname === '/api/player/team',
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          team: TEAM,
          members: MEMBERS,
          isCaptain: true,
          isManager: false,
          rosterLock: opts.rosterLock?.() ?? null,
        }),
      });
    }
  );
  await mockJson(page, '/api/teams/join-requests', {
    demandes: opts.joinRequests ?? [],
  });
  await mockJson(page, '/api/teams/invitations', { invitations: [] });
  await mockJson(page, '/api/player/notifications', {
    hasTeam: true,
    isCaptain: true,
    isManager: false,
    captainTeamId: TEAM.id,
    memberTeamId: TEAM.id,
    unreadMessages: 0,
    pendingScrims: 0,
    pendingJoinRequests: opts.joinRequests?.length ?? 0,
    checkinPending: 0,
    total: 0,
  });
}

test.describe('Espace capitaine — décisions', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('refus d’adhésion : motif + confirmation → POST avec le motif', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockCaptain(page, { joinRequests: [JOIN_REQUEST] });
    const decide = await captureJson(page, '/api/teams/join-requests', {
      success: true,
    });

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    const reason = page.getByLabel(T.reasonLabel);
    await expect(reason).toBeVisible({ timeout: 15000 });
    await reason.fill('Roster complet sur ce poste, désolée !');

    await page.getByRole('button', { name: T.reject, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(T.confirmTitle)).toBeVisible();
    await expect(dialog.getByText(T.confirmWithReason)).toBeVisible();
    await dialog.getByRole('button', { name: T.reject, exact: true }).click();

    await expect(page.getByText(T.rejected)).toBeVisible({ timeout: 10000 });
    expect(decide.requests).toHaveLength(1);
    expect(decide.requests[0].body).toMatchObject({
      demandeId: JOIN_REQUEST.id,
      action: 'reject',
      reason: 'Roster complet sur ce poste, désolée !',
    });
  });

  test('refus annulé à la confirmation : aucune requête', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockCaptain(page, { joinRequests: [JOIN_REQUEST] });
    const decide = await captureJson(page, '/api/teams/join-requests', {
      success: true,
    });

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    const rejectBtn = page.getByRole('button', {
      name: T.reject,
      exact: true,
    });
    await expect(rejectBtn).toBeVisible({ timeout: 15000 });
    await rejectBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(T.confirmTitle)).toBeVisible();
    await dialog
      .getByRole('button', { name: T.confirmNo, exact: true })
      .click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(CANDIDATE).first()).toBeVisible();
    expect(decide.requests).toHaveLength(0);
  });

  test('roster verrouillé : bandeau puis demande de dérogation', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    let sentAt: string | null = null;
    await mockCaptain(page, {
      rosterLock: () =>
        sentAt
          ? {
              ...LOCK,
              pendingRequest: { ticketId: 'tk-e2e', createdAt: sentAt },
            }
          : LOCK,
    });
    const reasons: unknown[] = [];
    await page.route(
      (url) => url.pathname === '/api/teams/roster-unlock-request',
      async (route) => {
        reasons.push(route.request().postDataJSON());
        sentAt = new Date().toISOString();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            request: { ticketId: 'tk-e2e', createdAt: sentAt },
          }),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    await expect(page.getByText(T.lockedTitle)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(T.lockedBody, { exact: false })).toBeVisible();

    await page.getByRole('button', { name: T.unlockCta }).click();
    const reason = page.getByLabel(T.unlockReason);
    const submit = page.getByRole('button', { name: T.unlockSubmit });

    // Motif trop court (< 10 caractères) : envoi impossible.
    await reason.fill('Blessure');
    await expect(submit).toBeDisabled();

    await reason.fill(
      'Notre DPS est blessée, remplacement par Coequipiere#0002.'
    );
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText(T.unlockPending)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: T.unlockCta })).toHaveCount(
      0
    );
    expect(reasons).toEqual([
      { reason: 'Notre DPS est blessée, remplacement par Coequipiere#0002.' },
    ]);
  });
});
