// E2E — demande déjà en attente sur /player/join-team et
// /player/request-captain : la page l'AFFICHE (équipe, date d'envoi) au lieu
// de renvoyer en silence vers /player, et « Annuler et choisir une autre
// équipe » (DELETE /api/demandes/cancel) rend le formulaire. Le TeamPicker
// montre alors, pour une équipe qui a publié une annonce, le badge « recrute »,
// les postes cherchés et le niveau.
//
// VRAIE joueuse connectée par /login (usePlayerSession) ; toutes les lectures
// et l'annulation sont simulées : rien n'est créé ni supprimé en base.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import { captureJson, mockJson } from './_helpers/adminScreenMocks';
import {
  PLAYER_PASSWORD,
  loginPlayer,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2ependingdemande@gmail.com');

// Date fixe (midi UTC : même jour quel que soit le fuseau du navigateur).
const SENT_AT = '2026-09-15T12:00:00.000Z';
const SENT_LABEL = '15 septembre 2026';

const RECRUITING = {
  id: 'team-e2e-recrute',
  name: 'Aurores Recrutent',
  short_name: 'AUR',
  logo_url: null,
  country: 'FR',
  member_count: 3,
  is_joinable: true,
  opening: { roles: ['tank', 'support'], level: 'gold' },
};
const QUIET = {
  id: 'team-e2e-calme',
  name: 'Comètes Tranquilles',
  short_name: 'COM',
  logo_url: null,
  country: 'FR',
  member_count: 2,
  is_joinable: true,
  opening: null,
};

// lib/i18n/locales/fr/{joinTeam,requestCaptain,teamPicker}.ts
const T = {
  joinPendingTitle: 'Tu as déjà une demande en attente',
  captainPendingTitle: 'Tu as déjà une demande de capitanat en attente',
  cancel: 'Annuler et choisir une autre équipe',
  modeExisting: 'Equipe existante',
  recruiting: 'recrute',
  lookingFor: 'Cherche : Tank, Support',
  level: 'Niveau : Or',
};

/** Sans équipe : le formulaire (et non « déjà dans une équipe ») s'affiche. */
async function mockNoTeam(page: Page) {
  await mockJson(page, '/api/player/team', {
    team: null,
    members: [],
    isCaptain: false,
    isManager: false,
  });
  await mockJson(page, '/api/teams', { teams: [QUIET, RECRUITING] });
}

/** Le TeamPicker affiche l'annonce de recrutement de l'équipe. */
async function expectRecruitingTeam(page: Page) {
  const option = page.getByRole('option', {
    name: new RegExp(RECRUITING.name),
  });
  await expect(option).toBeVisible({ timeout: 10000 });
  await expect(option.getByText(T.recruiting, { exact: true })).toBeVisible();
  await expect(option.getByText(T.lookingFor)).toBeVisible();
  await expect(option.getByText(T.level)).toBeVisible();
  // L'équipe sans annonce n'a ni badge ni postes.
  const quiet = page.getByRole('option', { name: new RegExp(QUIET.name) });
  await expect(quiet).toBeVisible();
  await expect(quiet.getByText(T.recruiting, { exact: true })).toHaveCount(0);
}

test.describe('Demande en attente : affichage et annulation', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('/player/join-team : demande affichée, annulée, formulaire rendu', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockNoTeam(page);
    await mockJson(page, '/api/demandes/join', {
      demandes: [
        {
          id: 'dem-join-1',
          status: 'pending',
          created_at: SENT_AT,
          team: { name: 'Équipe Visée' },
        },
      ],
    });
    const cancel = await captureJson(
      page,
      '/api/demandes/cancel',
      { success: true },
      { method: 'DELETE' }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/join-team');

    const notice = page.getByTestId('pending-demande-notice');
    await expect(
      notice.getByRole('heading', { name: T.joinPendingTitle })
    ).toBeVisible({ timeout: 15000 });
    await expect(notice).toContainText('« Équipe Visée »');
    await expect(notice).toContainText(SENT_LABEL);
    // Une seule demande à la fois : pas de formulaire tant qu'elle court.
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await notice.getByRole('button', { name: T.cancel }).click();

    await expect(notice).toHaveCount(0, { timeout: 10000 });
    expect(cancel.requests).toHaveLength(1);
    expect(cancel.requests[0].body).toEqual({ demandeId: 'dem-join-1' });

    await expectRecruitingTeam(page);
  });

  test('/player/join-team : échec de l’annulation → erreur, demande gardée', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockNoTeam(page);
    await mockJson(page, '/api/demandes/join', {
      demandes: [
        {
          id: 'dem-join-2',
          status: 'pending',
          created_at: null,
          team: { name: 'Équipe Visée' },
        },
      ],
    });
    await mockJson(
      page,
      '/api/demandes/cancel',
      { error: 'Demande introuvable.', code: 'NOT_FOUND' },
      { method: 'DELETE', status: 404 }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/join-team');

    const notice = page.getByTestId('pending-demande-notice');
    await expect(notice).toBeVisible({ timeout: 15000 });
    await notice.getByRole('button', { name: T.cancel }).click();

    await expect(notice.getByRole('alert')).toBeVisible({ timeout: 10000 });
    await expect(notice).toBeVisible();
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('/player/request-captain : demande affichée, annulée, TeamPicker rendu', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockNoTeam(page);
    await mockJson(page, '/api/demandes/captain', {
      demandes: [
        {
          id: 'dem-captain-1',
          status: 'pending',
          created_at: SENT_AT,
          payload: { existing_team_name: 'Équipe Reprise' },
        },
      ],
    });
    const cancel = await captureJson(
      page,
      '/api/demandes/cancel',
      { success: true },
      { method: 'DELETE' }
    );

    await loginPlayer(page, PLAYER_EMAIL, '/player/request-captain');

    const notice = page.getByTestId('pending-demande-notice');
    await expect(
      notice.getByRole('heading', { name: T.captainPendingTitle })
    ).toBeVisible({ timeout: 15000 });
    await expect(notice).toContainText('« Équipe Reprise »');
    await expect(notice).toContainText(SENT_LABEL);

    await notice.getByRole('button', { name: T.cancel }).click();

    await expect(notice).toHaveCount(0, { timeout: 10000 });
    expect(cancel.requests).toHaveLength(1);
    expect(cancel.requests[0].body).toEqual({ demandeId: 'dem-captain-1' });

    // Reprendre une équipe existante : le même TeamPicker.
    await page.getByRole('button', { name: T.modeExisting }).click();
    await expectRecruitingTeam(page);
  });
});
