import { test, expect } from '@playwright/test';

// La page /admin/reset-password ne doit afficher le formulaire que si une
// session de récupération est réellement établie. Sans code/token (lien
// expiré, déjà utilisé, ou ouvert sans paramètres), elle doit montrer un
// message clair + un bouton « Redemander un lien », et PAS de formulaire
// trompeur qui ne pourrait pas enregistrer.
test.describe('Admin reset-password — lien invalide', () => {
  test('sans code ni token : message d’erreur + bouton Redemander, aucun formulaire', async ({
    page,
  }) => {
    await page.goto('/admin/reset-password');

    // Le message d'erreur de session invalide apparaît une fois l'init terminée.
    await expect(
      page.getByText(/lien invalide, expiré ou déjà utilisé/i)
    ).toBeVisible();

    // Le bouton « Redemander un lien » pointe vers la demande de reset.
    const reask = page.getByRole('link', { name: /redemander un lien/i });
    await expect(reask).toBeVisible();
    await expect(reask).toHaveAttribute('href', '/admin/forgot-password');

    // Aucun champ de mot de passe : on ne propose pas un formulaire mort.
    await expect(page.locator('#password')).toHaveCount(0);
    await expect(page.locator('#confirm')).toHaveCount(0);
  });
});
