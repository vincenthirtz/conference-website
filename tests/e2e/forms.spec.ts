import { test, expect } from '@playwright/test';

test.describe('Formulaire de contact', () => {
  test('Le formulaire de contact est accessible', async ({ page }) => {
    await page.goto('/contact');

    // Vérifier que les champs du formulaire sont présents
    await expect(page.locator('input[name="name"], input#name')).toBeVisible();
    await expect(
      page.locator('input[name="email"], input#email, input[type="email"]')
    ).toBeVisible();
  });

  test('Validation du formulaire de contact - champs requis', async ({
    page,
  }) => {
    await page.goto('/contact');

    // Essayer de soumettre sans remplir
    const submitButton = page.locator('button[type="submit"]');
    if (await submitButton.isVisible()) {
      await submitButton.click();

      // Le formulaire ne devrait pas être soumis (validation HTML5)
      // On reste sur la même page
      expect(page.url()).toContain('/contact');
    }
  });
});

test.describe("Formulaire d'inscription", () => {
  test("Le formulaire d'inscription est accessible", async ({ page }) => {
    await page.goto('/register');

    // Vérifier que les champs du formulaire sont présents
    await expect(page.locator('input#displayName')).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.locator('input#confirm')).toBeVisible();
  });

  test('Validation mot de passe - erreur si différent', async ({ page }) => {
    await page.goto('/register');

    await page.fill('input#displayName', 'Test User');
    await page.fill('input#email', 'test@example.com');
    await page.fill('input#password', 'Password123!');
    await page.fill('input#confirm', 'DifferentPassword!');

    await page.click('button[type="submit"]');

    // Devrait afficher une erreur de correspondance (message spécifique)
    await expect(
      page.getByText('Les mots de passe ne correspondent pas.')
    ).toBeVisible({ timeout: 5000 });
  });

  test('Lien vers la page de connexion est présent', async ({ page }) => {
    await page.goto('/register');

    // Le lien vers la page de connexion doit être visible
    const loginLink = page.getByRole('link', { name: 'Connexion' });
    await expect(loginLink).toBeVisible({ timeout: 5000 });

    // Vérifier que le lien pointe vers /login
    await expect(loginLink).toHaveAttribute('href', '/login');
  });
});

test.describe("Formulaire de création d'équipe", () => {
  test("Le formulaire de création d'équipe est accessible", async ({
    page,
  }) => {
    await page.goto('/team/create');

    // Vérifier que les champs principaux sont présents
    await expect(page.getByPlaceholder('Ex : Phénix')).toBeVisible();
    await expect(page.getByPlaceholder('France, Europe…')).toBeVisible();
  });

  test('Bouton ajouter un membre fonctionne', async ({ page }) => {
    await page.goto('/team/create');

    // Compter les champs email initiaux
    const initialEmailInputs = await page
      .getByPlaceholder('joueuse@email.tld')
      .count();

    // Cliquer sur ajouter un membre
    await page.click('button:has-text("Ajouter")');

    // Il devrait y avoir un champ email de plus
    const newEmailInputs = await page
      .getByPlaceholder('joueuse@email.tld')
      .count();
    expect(newEmailInputs).toBeGreaterThan(initialEmailInputs);
  });
});

test.describe('Page admin login', () => {
  test('Le formulaire de login admin est accessible', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Erreur avec identifiants invalides', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input#email', 'fake@email.com');
    await page.fill('input#password', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Devrait afficher une erreur
    await expect(
      page.getByText(/erreur|invalide|incorrect|error/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
