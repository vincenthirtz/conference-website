// E2E — /player/scrim-planning/[planningId] (lot P10, trous e2e) : la grille
// de disponibilités s'affiche et la capitaine enregistre ses créneaux.
//
// `scrim-planning.spec.ts` couvre le CONTRAT des routes ; ici, l'ÉCRAN. VRAIE
// joueuse connectée par /login ; la session de planning et l'écriture
// (`/api/teams/scrim-plannings/**`) sont simulées : rien n'est créé en base.
import { test, expect } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  loginPlayer,
  mockApiJson,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2escrimgrid@gmail.com');

const PLANNING_ID = '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a';
const PAGE = `/player/scrim-planning/${PLANNING_ID}`;
const API = `/api/teams/scrim-plannings/${PLANNING_ID}`;

// lib/i18n/locales/fr/scrimPlanning.ts
const T = {
  fillAll: 'Tout sélectionner',
  save: 'Enregistrer mes dispos',
  autoSaved: 'Enregistré · auto',
  notParticipantTitle: 'Accès non autorisé',
  notParticipant: 'Tu ne participes pas à cette session de planning.',
};

function tomorrowYMD(): string {
  const d = new Date(Date.now() + 24 * 60 * 60_000);
  return d.toISOString().slice(0, 10);
}

const DETAIL = {
  planning: {
    id: PLANNING_ID,
    status: 'open',
    title: 'Scrim Aurores x Comètes',
    team1_id: 'team-aurores',
    team2_id: 'team-cometes',
    horizon_start: tomorrowYMD(),
    horizon_days: 2,
    slot_minutes: 60,
    day_start_min: 18 * 60,
    day_end_min: 21 * 60,
    timezone: 'Europe/Paris',
    staff_required: false,
    validated_slot: null,
  },
  myParty: 'team1',
  mySlots: [],
  heatmap: {},
};

test.describe('/player/scrim-planning/[planningId]', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  // Régression P10 : la redirection partait avant l'hydratation du routeur,
  // avec le repli `/login?next=/player` — le lien partagé perdait la grille.
  // Aucune session requise : tourne sans clé service.
  test('sans session → /login, retour sur la grille conservé', async ({
    page,
  }) => {
    await page.goto(PAGE);
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(new URL(page.url()).searchParams.get('next')).toBe(PAGE);
  });

  test('affiche la grille et enregistre les créneaux peints', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(page, API, DETAIL);
    let savedSlots: string[] | null = null;
    await page.route(
      (url) => url.pathname === `${API}/availability`,
      async (route) => {
        const body = route.request().postDataJSON() as { slots: string[] };
        savedSlots = body.slots;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, mySlots: body.slots }),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    await expect(
      page.getByRole('heading', { name: DETAIL.planning.title })
    ).toBeVisible({ timeout: 15000 });

    // Tout sélectionner puis enregistrer : la sauvegarde automatique peut
    // partir la première, l'une ou l'autre écrit les mêmes créneaux.
    await page.getByRole('button', { name: T.fillAll }).click();
    const saved = page.waitForRequest(
      (req) =>
        req.url().includes(`${API}/availability`) && req.method() !== 'GET'
    );
    await page.getByRole('button', { name: T.save }).click();
    await saved;

    await expect(page.getByText(T.autoSaved)).toBeVisible({ timeout: 10000 });
    expect(savedSlots).not.toBeNull();
    // 2 jours × 3 créneaux d'une heure (18 h → 21 h).
    expect(savedSlots!.length).toBe(6);
  });

  test('non participante → accès refusé, pas de grille', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockApiJson(
      page,
      API,
      { error: 'Not a participant of this planning.' },
      403
    );

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    await expect(page.getByText(T.notParticipantTitle)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(T.notParticipant)).toBeVisible();
    await expect(page.getByRole('button', { name: T.save })).toHaveCount(0);
  });
});
