// E2E — fil du match (/player/match/[matchId]), étape « Après le match » :
// le report de score de bout en bout, côté capitaine.
//
//   1. envoi du score → POST report-score en ABSOLU (team1/team2), puis
//      l'écran relu affiche « en attente de l'adversaire » avec le score ;
//   2. litige ouvert → les deux déclarations, l'échéance d'arbitrage et le
//      lien ticket pré-rempli (catégorie, sujet, message avec le match) ;
//   3. preuve jointe → succès (toast + compteur) et erreur serveur TRADUITE
//      (code NOT_REPORTER → phrase en français, pas le message brut).
//
// `player-match-thread.spec.ts` couvre l'enchaînement des étapes et les
// droits ; ici, le contenu de l'étape score. VRAIE joueuse connectée ; tout le
// match est simulé (`page.route`) : rien n'est écrit en base.
import { test, expect, type Page } from '@playwright/test';
import { createTestPlayer, deleteTestUser } from '../utils/supabaseTestClient';
import {
  PLAYER_PASSWORD,
  inMinutes,
  loginPlayer,
  perWorker,
  skipIfNoServiceRole,
} from './_helpers/playerSession';

const PLAYER_EMAIL = perWorker('hirtzvincent+e2escorereport@gmail.com');
const MATCH_ID = '22222222-3333-4444-5555-666666666666';
const PAGE = `/player/match/${MATCH_ID}`;
const DETAIL = `/api/player/matches/${MATCH_ID}`;

// lib/i18n/locales/fr/{playerMatch,playerMatches}.ts
const T = {
  reportCta: /Rapporter le score/i,
  myScore: 'Maps gagnées par mon équipe',
  oppScore: "Maps gagnées par l'adversaire",
  submit: 'Envoyer le score',
  awaitingToast: "Score envoyé. En attente de la confirmation de l'adversaire.",
  awaiting:
    'Ton report est enregistré (2–1). En attente de celui de l’adversaire.',
  disputed:
    'Les deux reports divergent : le staff arbitre. Tu peux corriger le tien.',
  disputeMine: 'Ton équipe a déclaré 2–1.',
  disputeOpponent: 'L’adversaire a déclaré 1–2 (ton score en premier).',
  disputeDelay: '(délai visé : 2 h)',
  ticketCta: /Ouvrir un ticket litige/,
  ticketSubject: 'Litige de score — Les Testeuses vs Rivales FC',
  evidenceSuccess: 'Capture jointe au match.',
  evidenceSent: 'Capture(s) jointe(s) depuis cette page : 1.',
  evidenceErrRight:
    'Seule la capitaine ou une manager d’une des équipes peut joindre une preuve.',
};

type Report = {
  state: string;
  mine: { mine: number; opponent: number } | null;
  dispute?: Record<string, unknown> | null;
};

function detail(status: string, report: Report) {
  return {
    match: {
      id: MATCH_ID,
      scheduledAt: inMinutes(-60),
      status,
      format: 'bo3',
      bestOf: 3,
      roundName: 'J2',
      streamUrl: null,
    },
    team: { id: 'team-1', name: 'Les Testeuses', slot: 1 },
    opponent: { id: 'opp-1', name: 'Rivales FC', slug: 'rivales-fc' },
    tournament: { id: 't-1', name: 'Conference Cup', slug: 'conference-cup' },
    checkin: {
      token: null,
      alreadyCheckedIn: true,
      checkedInAt: inMinutes(-90),
      opensAt: inMinutes(-120),
      closesAt: inMinutes(-65),
      isOpen: false,
      isPassed: true,
      canCheckIn: true,
    },
    readiness: null,
    score: null,
    result: null,
    report: { dispute: null, ...report },
    permissions: { validateLineup: true, reportScore: true },
  };
}

const DISPUTED = detail('disputed', {
  state: 'disputed',
  mine: { mine: 2, opponent: 1 },
  dispute: {
    opponentReport: { mine: 1, opponent: 2 },
    openedAt: inMinutes(-30),
    slaMinutes: 120,
    expectedBy: inMinutes(90),
    openedByStaff: false,
  },
});

/** GET du fil : sert `bodies[i]` au i-ème appel (le dernier ensuite). */
async function mockDetailSequence(page: Page, bodies: unknown[]) {
  let call = 0;
  await page.route(
    (url) => url.pathname === DETAIL,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const body = bodies[Math.min(call, bodies.length - 1)];
      call += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
  );
}

/** 1×1 PNG valide (octets réels : le serveur vérifie la signature). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function attachCapture(page: Page) {
  await page.getByTestId('match-evidence-input').setInputFiles({
    name: 'fin-de-match.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Fil du match — report de score', () => {
  test.beforeAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
    if (!skipIfNoServiceRole()) {
      await createTestPlayer(PLAYER_EMAIL, PLAYER_PASSWORD);
    }
  });

  test.afterAll(async () => {
    await deleteTestUser(PLAYER_EMAIL);
  });

  test('envoi du score → « en attente de l’adversaire »', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockDetailSequence(page, [
      detail('ongoing', { state: 'none', mine: null }),
      detail('ongoing', {
        state: 'awaiting_opponent',
        mine: { mine: 2, opponent: 1 },
      }),
    ]);
    const posted: unknown[] = [];
    await page.route(
      (url) => url.pathname === `${DETAIL}/report-score`,
      async (route) => {
        posted.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'awaiting_opponent',
            matchId: MATCH_ID,
          }),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    await page
      .getByRole('button', { name: T.reportCta })
      .first()
      .click({ timeout: 15000 });
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(T.myScore).fill('2');
    await dialog.getByLabel(T.oppScore).fill('1');
    await dialog.getByRole('button', { name: T.submit }).click();

    await expect(page.getByText(T.awaitingToast)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(T.awaiting)).toBeVisible({ timeout: 10000 });
    // Slot 1 : « mon équipe » = team1.
    expect(posted).toEqual([{ team1Score: 2, team2Score: 1 }]);
  });

  test('litige : deux déclarations, échéance et ticket pré-rempli', async ({
    page,
  }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockDetailSequence(page, [DISPUTED]);

    await loginPlayer(page, PLAYER_EMAIL, PAGE);

    const panel = page.getByTestId('match-dispute-panel');
    await expect(page.getByText(T.disputed)).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText(T.disputeMine)).toBeVisible();
    await expect(panel.getByText(T.disputeOpponent)).toBeVisible();
    await expect(panel).toContainText('Arbitrage attendu d’ici le');
    await expect(panel).toContainText(T.disputeDelay);

    const href = await panel
      .getByRole('link', { name: T.ticketCta })
      .getAttribute('href');
    expect(href).not.toBeNull();
    const ticket = new URL(href!, 'http://localhost');
    expect(ticket.pathname).toBe('/support');
    expect(ticket.searchParams.get('category')).toBe('dispute');
    expect(ticket.searchParams.get('subject')).toBe(T.ticketSubject);
    const message = ticket.searchParams.get('message') ?? '';
    expect(message).toContain(PAGE);
    expect(message).toContain('2–1');
  });

  test('preuve : capture jointe, compteur incrémenté', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockDetailSequence(page, [DISPUTED]);
    const uploads: { file_base64?: string; filename?: string }[] = [];
    await page.route(
      (url) => url.pathname === `${DETAIL}/evidence`,
      async (route) => {
        uploads.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'ev-1', kind: 'screenshot' }),
        });
      }
    );

    await loginPlayer(page, PLAYER_EMAIL, PAGE);
    await expect(page.getByTestId('match-evidence-input')).toBeAttached({
      timeout: 15000,
    });
    await attachCapture(page);

    await expect(page.getByText(T.evidenceSuccess)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(T.evidenceSent)).toBeVisible();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].filename).toBe('fin-de-match.png');
    expect(uploads[0].file_base64).toMatch(/^data:image\/png;base64,/);
  });

  test('preuve refusée : l’erreur serveur est traduite', async ({ page }) => {
    test.skip(skipIfNoServiceRole(), 'Supabase service role manquant');
    await mockDetailSequence(page, [DISPUTED]);
    await page.route(
      (url) => url.pathname === `${DETAIL}/evidence`,
      (route) =>
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Only a captain or manager may attach evidence.',
            code: 'NOT_REPORTER',
          }),
        })
    );

    await loginPlayer(page, PLAYER_EMAIL, PAGE);
    await expect(page.getByTestId('match-evidence-input')).toBeAttached({
      timeout: 15000,
    });
    await attachCapture(page);

    await expect(page.getByText(T.evidenceErrRight)).toBeVisible({
      timeout: 10000,
    });
    // Le message brut de l'API ne fuit pas à l'écran.
    await expect(
      page.getByText('Only a captain or manager may attach evidence.')
    ).toHaveCount(0);
    await expect(page.getByText(T.evidenceSent)).toHaveCount(0);
  });
});
