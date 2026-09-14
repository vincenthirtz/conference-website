// e2e — le catalogue TCG public (`/tcg`).
//
// CE QUE CE FICHIER PROTÈGE AVANT TOUT : la page montre des cartes, et elle ne
// doit montrer AUCUNE joueuse. Deux règles écrites du dépôt l'imposent —
// `docs/TCG.md` §1 (« les deux seuls endroits publics » où une carte apparaît)
// et `create_player_discovery_profiles.sql` du 13/07 (« aucune route publique
// ne liste les joueurs »). Une page de catalogue est précisément le genre
// d'écran qui les enfreint sans qu'on s'en aperçoive, parce qu'ajouter une
// troisième famille au rendu est une ligne de code anodine.
//
// La sonde est la même que celle de `tcg.spec.ts` : le chemin d'une photo TCG
// dans le bucket PUBLIC embarque l'identifiant de la joueuse, donc une fuite se
// détecte depuis le HTML seul, sans lire la base.
//
// Spec strictement en LECTURE : aucun import du client service-role.

import { test, expect } from '@playwright/test';

/** `tcg/<userId>-<hash>.<ext>` dans le bucket public `teams-images`. */
const TCG_PHOTO_URL_RE = /teams-images\/tcg\/([0-9a-fA-F-]{36})-/g;

test.describe('TCG — catalogue public', () => {
  test('la page répond et présente le jeu', async ({ page }) => {
    const res = await page.goto('/tcg');
    expect(res?.status(), '/tcg ne doit pas 4xx/5xx').toBeLessThan(400);

    await expect(
      page.getByRole('heading', { level: 1, name: /TCG/i })
    ).toBeVisible();
    // La vitrine explique comment on gagne des cartes : sans elle, la page
    // n'est qu'une grille muette pour qui découvre.
    await expect(
      page.getByText(/comment on obtient des cartes/i)
    ).toBeVisible();
  });

  test('ne sert AUCUNE photo de joueuse', async ({ page }) => {
    await page.goto('/tcg');
    const html = await page.content();
    const owners = [...html.matchAll(TCG_PHOTO_URL_RE)].map((m) => m[1]);

    expect(
      owners,
      'le catalogue public ne doit servir aucune photo TCG de joueuse'
    ).toEqual([]);
  });

  test('énumère les équipes et les maps, et sait les filtrer', async ({
    page,
  }) => {
    await page.goto('/tcg');

    const all = page.getByRole('button', { name: 'Tout' });
    const teams = page.getByRole('button', { name: 'Équipes' });
    const maps = page.getByRole('button', { name: 'Maps' });
    await expect(all).toBeVisible();
    await expect(teams).toBeVisible();
    await expect(maps).toBeVisible();

    // Le registre de maps est en mémoire et non vide par construction : c'est
    // la famille sur laquelle on peut affirmer un minimum sans connaître la base.
    await maps.click();
    await expect(maps).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('article, a').first()).toBeVisible();
  });

  test('dit que les cartes de joueuses existent sans les lister', async ({
    page,
  }) => {
    await page.goto('/tcg');

    // L'encart doit NOMMER la règle, pas se contenter de taire la famille :
    // sans explication, l'absence se lit comme un oubli et quelqu'un
    // « corrigera » en ajoutant la liste.
    await expect(
      page.getByRole('heading', { name: /cartes de joueuses/i })
    ).toBeVisible();
    await expect(page.getByText(/ne liste pas les joueuses/i)).toBeVisible();
  });
});
