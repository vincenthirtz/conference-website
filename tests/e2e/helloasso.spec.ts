import { test, expect } from '@playwright/test';

// ─── Page de don (frontend) ────────────────────────────────────

test.describe('Page de don — coming soon', () => {
  test('La page /don affiche le bandeau "coming soon" sur le formulaire', async ({
    page,
  }) => {
    await page.goto('/don');

    // The overlay on the form section
    await expect(page.getByText('Coming soon')).toBeVisible();
    // "Paiement en ligne bientôt disponible" appears in hero + overlay — check at least one
    await expect(
      page.getByText('Paiement en ligne bientôt disponible').first()
    ).toBeVisible();
  });

  test('Le formulaire de don est désactivé (inputs disabled)', async ({
    page,
  }) => {
    await page.goto('/don');

    await expect(page.locator('#don-prenom')).toBeDisabled();
    await expect(page.locator('#don-nom')).toBeDisabled();
    await expect(page.locator('#don-email')).toBeDisabled();
    await expect(page.getByPlaceholder('Autre (€)')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /Donner.*HelloAsso/ })
    ).toBeDisabled();
  });

  test('Les boutons de montant prédéfini sont désactivés', async ({ page }) => {
    await page.goto('/don');

    await expect(
      page.getByRole('button', { name: '25 €', exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: '50 €', exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: '100 €', exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: '250 €', exact: true })
    ).toBeDisabled();
  });

  test('Le CTA hero affiche "bientôt disponible" au lieu du lien', async ({
    page,
  }) => {
    await page.goto('/don');

    // The CTA should NOT be a link
    await expect(
      page.getByRole('link', { name: 'Faire un don en ligne' })
    ).not.toBeVisible();

    // Instead, it should be a static text
    const heroBanner = page.locator('span', {
      hasText: 'Paiement en ligne bientôt disponible',
    });
    await expect(heroBanner.first()).toBeVisible();
  });

  test("Le bandeau de succès s'affiche avec ?status=success", async ({
    page,
  }) => {
    await page.goto('/don?status=success');

    await expect(page.getByText('Merci pour votre don')).toBeVisible();
  });

  test("Le bandeau d'erreur s'affiche avec ?status=error", async ({ page }) => {
    await page.goto('/don?status=error');

    await expect(page.getByText("Le paiement n'a pas abouti")).toBeVisible();
  });

  test('Les sections alternatives (virement / entreprises) restent actives', async ({
    page,
  }) => {
    await page.goto('/don');

    await expect(page.getByText('Virement', { exact: true })).toBeVisible();
    await expect(page.getByText('Entreprises', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Demander le RIB' })
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Parler sponsoring' })
    ).toBeEnabled();
  });
});

// ─── API checkout endpoint ─────────────────────────────────────

test.describe('API /api/helloasso/checkout', () => {
  test('POST sans body renvoie 400', async ({ request }) => {
    const res = await request.post('/api/helloasso/checkout', {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST avec montant invalide renvoie 400', async ({ request }) => {
    const res = await request.post('/api/helloasso/checkout', {
      data: {
        amount: 50, // 0.50 € — below 1 € minimum
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('minimum');
  });

  test('POST avec email invalide renvoie 400', async ({ request }) => {
    const res = await request.post('/api/helloasso/checkout', {
      data: {
        amount: 2500,
        firstName: 'Test',
        lastName: 'User',
        email: 'not-an-email',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('GET renvoie 405', async ({ request }) => {
    const res = await request.get('/api/helloasso/checkout');
    expect(res.status()).toBe(405);
  });
});

// ─── API webhook endpoint ──────────────────────────────────────

test.describe('API /api/helloasso/webhook', () => {
  // Le webhook exige désormais un secret partagé (?token= ou
  // x-helloasso-signature). Le secret réel n'étant pas exposé aux tests e2e,
  // on vérifie surtout que les requêtes NON authentifiées sont rejetées
  // (anti-spoofing de paiements), sans dépendre de la config env.
  const VALID_PAYLOAD = {
    eventType: 'Payment',
    data: {
      id: 12345,
      amount: 2500,
      state: 'Authorized',
      payer: {
        firstName: 'Test',
        lastName: 'Donor',
        email: 'test@example.com',
      },
    },
  };

  test('POST sans secret est rejeté (401 ou 503 fail-closed)', async ({
    request,
  }) => {
    const res = await request.post('/api/helloasso/webhook', {
      data: VALID_PAYLOAD,
    });
    // 401 si le secret est configuré (token absent/incorrect),
    // 503 si HELLOASSO_WEBHOOK_SECRET n'est pas configuré (fail-closed).
    // Dans les deux cas : pas de 200 → pas d'event de paiement émis.
    expect([401, 503]).toContain(res.status());
  });

  test('POST avec token bidon est rejeté', async ({ request }) => {
    const res = await request.post(
      '/api/helloasso/webhook?token=definitely-wrong-secret',
      { data: VALID_PAYLOAD }
    );
    expect([401, 503]).toContain(res.status());
  });

  test('GET renvoie 405', async ({ request }) => {
    const res = await request.get('/api/helloasso/webhook');
    expect(res.status()).toBe(405);
  });
});

// ─── Admin API — HelloAsso memberships ─────────────────────────

test.describe('API /api/admin/helloasso/memberships (protection)', () => {
  test('GET sans auth renvoie 401', async ({ request }) => {
    const res = await request.get('/api/admin/helloasso/memberships');
    expect(res.status()).toBe(401);
  });

  test('GET avec token invalide renvoie 401', async ({ request }) => {
    const res = await request.get('/api/admin/helloasso/memberships', {
      headers: { Authorization: 'Bearer invalid_token' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST sans auth est refusé', async ({ request }) => {
    const res = await request.post('/api/admin/helloasso/memberships');
    expect([401, 403, 405]).toContain(res.status());
  });
});

test.describe('API /api/admin/helloasso/sync (protection)', () => {
  test('POST sans auth est refusé', async ({ request }) => {
    const res = await request.post('/api/admin/helloasso/sync');
    expect([401, 403]).toContain(res.status());
  });

  test('POST avec token invalide est refusé', async ({ request }) => {
    const res = await request.post('/api/admin/helloasso/sync', {
      headers: { Authorization: 'Bearer invalid_token' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET sans auth est refusé', async ({ request }) => {
    const res = await request.get('/api/admin/helloasso/sync');
    expect([401, 403, 405]).toContain(res.status());
  });
});
