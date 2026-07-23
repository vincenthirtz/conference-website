import { test, expect } from '@playwright/test';

// Refonte accueil 2026 : hero focalisé (countdown intégré), spotlight événement
// live-aware, « participer en 3 étapes », actus (section#news), bande soutiens,
// newsletter. Footer inchangé (composant partagé).

test.describe('Home — hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the H1 with current year', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/OW WOMEN['’]?S CUP/i);
    const text = await heading.textContent();
    expect(text).toMatch(/\b20\d{2}\b/);
  });

  test('primary CTAs link to the right places', async ({ page }) => {
    const inscrire = page.getByRole('link', { name: /Inscrire mon équipe/i });
    await expect(inscrire.first()).toBeVisible();
    await expect(inscrire.first()).toHaveAttribute('href', '/team/create');

    const discord = page.getByRole('link', { name: /Rejoindre le Discord/i });
    await expect(discord).toBeVisible();
    await expect(discord).toHaveAttribute(
      'href',
      'https://discord.gg/gERSsjC3Vd'
    );
  });

  test('hero decorative aurora is present and aria-hidden', async ({ page }) => {
    const aurora = page.locator('header.hero-section .hero-aurora');
    await expect(aurora).toBeAttached();
    await expect(aurora).toHaveAttribute('aria-hidden', 'true');
  });
});

test.describe('Home — countdown (integrated pill)', () => {
  test('when a target date is set, the hero pill shows 4 countdown cells', async ({
    page,
  }) => {
    await page.goto('/');
    // Pastille de statut/countdown intégrée au hero (aria-live). Conditionnelle :
    // sans date configurée, la pastille n'apparaît pas → skip.
    const pill = page.locator('header.hero-section [aria-live="polite"]');
    const count = await pill.count();
    test.skip(count === 0, 'No countdown target configured');

    await expect(pill.first()).toBeVisible();
    const cells = pill.first().locator('span.tabular-nums');
    await expect(cells).toHaveCount(4);
  });
});

test.describe('Home — event spotlight', () => {
  test('spotlight section + "Voir le tournoi" link when a tournament exists', async ({
    page,
  }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', {
      name: /Le prochain rendez-vous/i,
    });
    // La section spotlight n'est rendue que s'il existe un tournoi
    // running/published (sinon HomeSpotlight renvoie null) → skip si absente.
    const count = await heading.count();
    test.skip(count === 0, 'No running/published tournament configured');

    await expect(heading).toBeVisible();
    const seeTournament = page.getByRole('link', { name: /Voir le tournoi/i });
    await expect(seeTournament.first()).toBeVisible();
    await expect(seeTournament.first()).toHaveAttribute(
      'href',
      /^\/tournament\//
    );
  });
});

test.describe('Home — participer en 3 étapes', () => {
  test('renders the 3-step section with a primary CTA', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section#participer');
    await expect(section).toBeVisible();
    await expect(
      section.getByRole('heading', { name: /en 3 étapes/i })
    ).toBeVisible();

    // 3 étapes numérotées, liens vers create / inscription / live.
    const stepLinks = section.locator('ol a');
    await expect(stepLinks).toHaveCount(3);
    await expect(section.locator('a[href="/team/create"]').first()).toBeVisible();
    await expect(section.locator('a[href="/inscription-2026"]')).toBeVisible();
    await expect(section.locator('a[href="/live"]')).toBeVisible();
  });
});

test.describe('Home — news', () => {
  test('section renders featured cards + "Toutes les actus" link', async ({
    page,
  }) => {
    await page.goto('/');
    const section = page.locator('section#news');
    await expect(section).toBeVisible();

    await expect(
      section.getByRole('heading', { name: /derni[eè]res actus/i })
    ).toBeVisible();

    const seeAll = page
      .getByRole('link', { name: /Toutes les actus/i })
      .first();
    await expect(seeAll).toBeVisible();
    await expect(seeAll).toHaveAttribute('href', '/news');

    const articleLinks = section.locator('a[href^="/news/"]');
    if ((await articleLinks.count()) > 0) {
      await expect(articleLinks.first()).toBeVisible();
    }
  });
});

test.describe('Home — support strip (sponsors + press merged)', () => {
  test('renders the support lead and a partners link when data exists', async ({
    page,
  }) => {
    await page.goto('/');
    const lead = page.getByText(/soutiennent la comp[ée]tition/i);
    const count = await lead.count();
    test.skip(count === 0, 'No partners/press configured');

    await expect(lead.first()).toBeVisible();
    const seeAll = page.getByRole('link', {
      name: /Voir tous les partenaires/i,
    });
    await expect(seeAll).toBeVisible();
    await expect(seeAll).toHaveAttribute('href', '/partenaires');
  });
});

test.describe('Home — footer 3 columns', () => {
  test('shows the three column titles and brand block', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('[data-test="footer"]');
    await expect(footer).toBeVisible();

    await expect(
      footer.getByText("OW Women's Cup", { exact: true })
    ).toBeVisible();
    await expect(
      footer.getByRole('heading', { name: /^Tournoi$/ })
    ).toBeVisible();
    await expect(
      footer.getByRole('heading', { name: /^Communauté$/ })
    ).toBeVisible();
    await expect(
      footer.getByRole('heading', { name: /Légal & contact/i })
    ).toBeVisible();
  });

  test('exposes the 5 social links in the brand column', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('[data-test="footer"]');
    for (const network of ['TikTok', 'Instagram', 'Twitch', 'YouTube', 'RSS']) {
      await expect(footer.getByRole('link', { name: network })).toBeVisible();
    }
  });
});
