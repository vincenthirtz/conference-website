import { test, expect } from '@playwright/test';

const PATH = '/guide/gerer-mon-equipe';

test.describe('Guide capitaine — /guide/gerer-mon-equipe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PATH);
  });

  test('renders the H1 hero', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /G[èe]re ton [ée]quipe en quelques clics/i,
      })
    ).toBeVisible();
  });

  test('exposes a "Créer mon équipe" CTA pointing at /team/create', async ({
    page,
  }) => {
    const cta = page.getByRole('link', { name: /Cr[ée]er mon [ée]quipe/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/team/create');
  });

  test('exposes an "Aller à mon espace" CTA pointing at /player', async ({
    page,
  }) => {
    const cta = page.getByRole('link', {
      name: /Aller [àa] mon espace/i,
    });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/player');
  });

  test('lists the six steps with their numbers and titles', async ({ page }) => {
    const expectedTitles = [
      /Inscris ton [ée]quipe/i,
      /Re[çc]ois et valide les candidatures/i,
      /G[èe]re le roster et les r[ôo]les/i,
      /Discute avec les autres capitaines/i,
      /Check-in du prochain match/i,
      /Propose des scrims/i,
    ];
    for (const title of expectedTitles) {
      await expect(
        page.getByRole('heading', { level: 2, name: title })
      ).toBeVisible();
    }
    // Step badges 01..06
    for (const num of ['01', '02', '03', '04', '05', '06']) {
      await expect(page.getByText(`Étape ${num}`)).toBeVisible();
    }
  });

  test('includes mock previews with brand demo data', async ({ page }) => {
    // The roster preview surfaces the same fake captain BattleTag in
    // multiple steps — pick one we expect.
    await expect(page.getByText('Lina#21834').first()).toBeVisible();
    // The next-match preview shows the demo opponent.
    await expect(page.getByText(/Avoidgers/).first()).toBeVisible();
    // The agenda preview spells out the example date.
    await expect(
      page.getByText(/dimanche 18 mai 2026 à 19:00/i)
    ).toBeVisible();
  });

  test('shows the "Et aussi" feature grid with 4 cards', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Et aussi/i })
    ).toBeVisible();
    for (const title of [
      'Cloche de notifications',
      'Page publique d’équipe',
      'Historique des demandes',
      'Sécurité & modération',
    ]) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('final CTA section links to /team/create and /espace-capitaine#faq', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /Pr[êe]te [àa] passer le brassard/i })
    ).toBeVisible();
    const faqLink = page.getByRole('link', {
      name: /Lire la FAQ capitaine/i,
    });
    await expect(faqLink).toBeVisible();
    await expect(faqLink).toHaveAttribute('href', '/espace-capitaine#faq');
  });
});
