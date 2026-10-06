// E2E — /inscription-2026 (lot P10, trous e2e) : le guide d'inscription
// s'affiche et mène à l'inscription d'équipe — ou, tournoi complet, cesse
// d'y inviter (état déduit des places, cf. getStaticProps).
//
// Page publique en ISR : aucune session, aucune donnée à semer. L'état
// « complet » dépend de la base partagée, la spec accepte donc les deux
// branches et vérifie que chacune est cohérente.
import { test, expect } from '@playwright/test';

// lib/i18n/locales/fr/inscription2026.ts
const T = {
  heroTitle: 'Comment inscrire ton équipe au tournoi féminin 2026',
  ctaRegister: 'Inscrire mon équipe',
  tournamentFull: 'Tournoi complet',
  ctaCreateTeam: 'Créer mon équipe',
  stepsTitle: "5 étapes pour t'inscrire",
  step1Cta: 'Créer mon compte',
  faqTitle: 'FAQ inscription',
  faq1Q: 'Le tournoi est-il réservé aux joueuses ?',
};

test.describe('/inscription-2026', () => {
  test('affiche le guide et un appel à l’inscription cohérent', async ({
    page,
  }) => {
    await page.goto('/inscription-2026');

    await expect(
      page.getByRole('heading', { name: T.heroTitle, level: 1 })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: T.stepsTitle, level: 2 })
    ).toBeVisible();
    await expect(
      page
        .locator('#etapes')
        .getByRole('link', { name: new RegExp(T.step1Cta) })
    ).toHaveAttribute('href', '/register');

    const register = page.getByRole('link', {
      name: new RegExp(T.ctaRegister),
    });
    if ((await page.getByText(T.tournamentFull).count()) > 0) {
      // Complet : plus aucune porte vers l'inscription au tournoi.
      await expect(register).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: new RegExp(T.ctaCreateTeam) })
      ).toHaveAttribute('href', '/team/create');
    } else {
      // Ouvert : le bouton du héros mène à l'inscription du tournoi actif.
      await expect(register.first()).toHaveAttribute(
        'href',
        /^\/team\/create\?tournament=/
      );
      await register.first().click();
      await page.waitForURL(/\/team\/create\?tournament=/, {
        timeout: 15000,
      });
    }
  });

  test('la FAQ s’ouvre depuis le raccourci du héros', async ({ page }) => {
    await page.goto('/inscription-2026');

    // Le raccourci du héros (ancre), pas un éventuel « FAQ » du menu.
    await page.locator('a[href="#faq"]').click();
    await expect(page).toHaveURL(/#faq$/);
    await expect(
      page.getByRole('heading', { name: T.faqTitle, level: 2 })
    ).toBeInViewport();

    const question = page.locator('details').filter({ hasText: T.faq1Q });
    await expect(question).not.toHaveAttribute('open', '');
    await question.locator('summary').click();
    await expect(question).toHaveAttribute('open', '');
    await expect(question.getByText(/100\s?%\s?féminine/)).toBeVisible();
  });
});
