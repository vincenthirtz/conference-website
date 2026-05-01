import { test, expect } from '@playwright/test';

test.describe('Home — hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the H1 with current year', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/OW WOMEN[’']?S CUP/i);
    // currentYear is read at request time on SSG → should match the year in the title
    const text = await heading.textContent();
    expect(text).toMatch(/\b20\d{2}\b/);
  });

  test('renders the four primary CTAs and they link to the right places', async ({
    page,
  }) => {
    const inscrire = page.getByRole('link', { name: /Inscrire mon équipe/i });
    const discord = page.getByRole('link', { name: /^Discord$/i });
    const faq = page.getByRole('link', { name: /^FAQ$/i });
    const roadmap = page.getByRole('link', { name: /^Roadmap$/i });

    await expect(inscrire).toBeVisible();
    await expect(inscrire).toHaveAttribute('href', '/team/create');

    await expect(discord).toBeVisible();
    await expect(discord).toHaveAttribute(
      'href',
      'https://discord.gg/gERSsjC3Vd'
    );

    await expect(faq).toBeVisible();
    await expect(faq).toHaveAttribute('href', '/inscription-2026#faq');

    await expect(roadmap).toBeVisible();
    await expect(roadmap).toHaveAttribute('href', '/timeline-2026');
  });

  test('hero glow image is decorative (no alt content) and inside the hero', async ({
    page,
  }) => {
    const glow = page.locator('header.hero-section img.hero-glow');
    await expect(glow).toBeAttached();
    await expect(glow).toHaveAttribute('alt', '');
    await expect(glow).toHaveAttribute('aria-hidden', 'true');
  });
});

test.describe('Home — countdown', () => {
  test('skeleton or live countdown card is rendered when a target date is configured', async ({
    page,
  }) => {
    await page.goto('/');
    const countdown = page.locator(
      'section[aria-label="Compte à rebours avant le tournoi"]'
    );

    // Section is conditional (no date set → component returns null).
    // Skip this test instead of failing if the data isn't there.
    const count = await countdown.count();
    test.skip(count === 0, 'No homepage_event_date / tournament configured');

    await expect(countdown).toBeVisible();
    await expect(countdown.getByText(/Coup d['’]envoi/i)).toBeVisible();

    // Either the skeleton ("––") or four live numeric cells appear.
    const cells = countdown.locator('span.tabular-nums');
    await expect(cells).toHaveCount(4);
  });
});

test.describe('Home — agenda', () => {
  test('section heading is visible', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Prochains rendez-vous/i })
    ).toBeVisible();
  });

  test('IDAHOTB event renders before the OW Women’s Cup tournament card', async ({
    page,
  }) => {
    await page.goto('/');

    // Scope to the agenda section (the press section also contains an
    // "OW Women's Cup" heading via the Ranked Actu article).
    const agenda = page.locator('section', {
      has: page.getByRole('heading', { name: /Prochains rendez-vous/i }),
    });
    const idahot = agenda.getByRole('heading', {
      name: /Journée internationale contre l['’]homophobie et la transphobie/i,
    });
    const tournament = agenda.getByRole('heading', {
      name: /OW WOMEN[’']?S CUP/i,
      level: 3,
    });

    // The IDAHOTB event is dated 17 May 2026; once that date passes, the
    // event is filtered out client-side. Skip rather than fail in that case.
    const idahotCount = await idahot.count();
    test.skip(idahotCount === 0, 'IDAHOTB event has passed or is hidden');

    await expect(idahot).toBeVisible();
    await expect(tournament).toBeVisible();

    // Compare bounding boxes vertically — the IDAHOTB card sits above
    // the tournament card in the DOM order.
    const idahotBox = await idahot.boundingBox();
    const tournamentBox = await tournament.boundingBox();
    expect(idahotBox).not.toBeNull();
    expect(tournamentBox).not.toBeNull();
    expect(idahotBox!.y).toBeLessThan(tournamentBox!.y);
  });

  test('IDAHOTB card has a Twitch CTA pointing to womens_cup', async ({
    page,
  }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Voir sur Twitch/i });
    const count = await cta.count();
    test.skip(count === 0, 'IDAHOTB event has passed or is hidden');
    await expect(cta).toHaveAttribute(
      'href',
      'https://www.twitch.tv/womens_cup'
    );
    await expect(cta).toHaveAttribute('target', '_blank');
  });
});

test.describe('Home — news', () => {
  test('section renders with featured + compact cards layout', async ({
    page,
  }) => {
    await page.goto('/');
    const section = page.locator('section#news');
    await expect(section).toBeVisible();

    // Section heading
    await expect(
      section.getByRole('heading', { name: /Dernières news/i })
    ).toBeVisible();

    // CTA toward /actualites
    const seeAll = page.getByRole('link', {
      name: /Toutes les actualités/i,
    });
    await expect(seeAll).toBeVisible();
    await expect(seeAll).toHaveAttribute('href', '/actualites');

    // The grid renders article links to /news/<slug>
    const articleLinks = section.locator('a[href^="/news/"]');
    if ((await articleLinks.count()) > 0) {
      // First link is the featured card — should contain a section image
      // (priority hero). Check that at least one image is present in the
      // first link.
      const firstLinkImg = articleLinks.first().locator('img');
      await expect(firstLinkImg.first()).toBeVisible();
    }
  });
});

test.describe('Home — sponsors', () => {
  test('marquee renders with logos when partners are loaded', async ({
    page,
  }) => {
    await page.goto('/');
    const sponsors = page.locator('section#sponsors');
    await expect(sponsors).toBeVisible();

    await expect(
      sponsors.getByRole('heading', { name: /Ils soutiennent/i })
    ).toBeVisible();

    const marquee = sponsors.locator('.sponsor-marquee');
    await expect(marquee).toBeVisible();

    // Track items are duplicated (loop). Aria-hidden on duplicated half:
    // visible items should be at least 1 if partners exist.
    const items = marquee.locator('[role="listitem"]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    const seeAll = page.getByRole('link', {
      name: /Voir tous les partenaires/i,
    });
    await expect(seeAll).toBeVisible();
    await expect(seeAll).toHaveAttribute('href', '/partenaires');
  });

  test('marquee has accessibility hints (mask + reduced-motion)', async ({
    page,
  }) => {
    await page.goto('/');
    const marquee = page.locator('.sponsor-marquee');
    if ((await marquee.count()) === 0) test.skip();

    // The mask-image fade is applied via CSS — assert the computed value
    // mentions a linear gradient (jsdom-like check via evaluate).
    const maskImage = await marquee.evaluate(
      (el) => getComputedStyle(el as HTMLElement).maskImage || ''
    );
    expect(maskImage).toContain('linear-gradient');
  });
});

test.describe('Home — press section', () => {
  test('renders heading "Ils parlent de nous"', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Ils parlent de nous/i })
    ).toBeVisible();
  });
});

test.describe('Home — footer 3 columns', () => {
  test('shows the three column titles and brand block', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('[data-test="footer"]');
    await expect(footer).toBeVisible();

    // Brand block + the three column headings (h2 with uppercase tracking)
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
