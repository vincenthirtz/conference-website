// E2E — parcours PUBLIC du TCG (cartes à collectionner).
//
// SPEC STRICTEMENT EN LECTURE. Elle n'écrit rien, nulle part, et c'est
// structurel plutôt que déclaratif : ce fichier n'importe PAS
// `tests/utils/supabaseTestClient.ts`, qui est le seul point d'accès
// service-role des e2e. Sans ce handle, aucun `insert` / `update` / `delete`
// n'est atteignable depuis ici. Toutes les interactions sont des GET HTTP
// (pages publiques + API publiques en lecture).
//
// COROLLAIRE VOULU : la spec est sûre même si `.env.local` pointe sur la
// PRODUCTION. Elle ne peut pas semer la prod puisqu'elle ne peut rien écrire,
// et elle ne déclenche pas le garde-fou de `supabaseTestClient` (qui lève à
// l'import dès que l'URL n'est pas locale) puisqu'elle ne l'importe pas.
//
// PAS DE FIXTURES, DONC DÉCOUVERTE À CHAUD. Semer une joueuse ou une équipe
// demanderait précisément le service-role qu'on s'interdit. On découvre donc
// des sujets RÉELS via les API publiques (`/api/public/v1/leaderboard`,
// `/api/teams`), et on saute proprement quand la base est vide — un
// environnement fraîchement initialisé n'est pas un échec de test.
//
// Ce qu'on ne peut PAS vérifier sans accès base, et qu'on ne prétend donc pas
// vérifier : qu'une photo précise soit `pending` ou `approved`. On vérifie à la
// place deux invariants de fuite qui, eux, se lisent dans le HTML servi (cf.
// `assertNoForeignTcgPhoto`).

import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

/**
 * Libellés de rareté, côté FR (`lib/i18n/locales/fr/playerTcg.ts`). Le FR est
 * la locale par défaut ; le suffixe « · Brillante » est optionnel car le foil
 * est une variante d'impression, pas un palier (cf. `utils/tcg/rarity.ts`).
 */
const RARITY_LABEL_RE = /^(Commune|Rare|Épique|Légendaire)(\s·\s.+)?$/;

/**
 * Chemin de stockage d'une photo TCG : `tcg/<userId>-<hash>.<ext>` dans le
 * bucket public `teams-images` (cf. `pages/api/player/tcg/photo.ts`). Le chemin
 * EMBARQUE l'identifiant de la joueuse, ce qui rend une fuite croisée
 * détectable depuis le HTML seul, sans lire la base.
 */
const TCG_PHOTO_URL_RE = /teams-images\/tcg\/([0-9a-fA-F-]{36})-/g;

/** UUID v4 syntaxiquement valide mais qui n'existe pas — pour les 404. */
const UNKNOWN_USER_ID = '00000000-0000-4000-8000-000000000000';

/** Section « Sa carte » d'une page (fiche joueuse comme fiche équipe). */
function tcgSection(page: Page) {
  return page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: 'Sa carte', exact: true }),
    })
    .first();
}

/**
 * Un identifiant de joueuse RÉELLE, prise en tête de classement.
 *
 * Le classement est la bonne source : `/player/[userId]` rend un 404 pour une
 * joueuse sans profil lisible, donc piocher ailleurs (un roster, par exemple)
 * exposerait le test à des 404 légitimes.
 */
async function discoverPlayerId(
  request: APIRequestContext
): Promise<string | null> {
  const res = await request.get('/api/public/v1/leaderboard?limit=1');
  if (!res.ok()) return null;
  const body = await res.json();
  const players = (body?.data ?? []) as Array<{ userId?: string }>;
  return players[0]?.userId ?? null;
}

/**
 * Une équipe RÉELLE. `/api/teams` n'expose pas le slug, mais la page publique
 * accepte l'UUID et redirige en 308 vers l'URL canonique (back-compat testée
 * par `team-slug.spec.ts`) : passer par l'id suffit donc, et évite de dépendre
 * d'un champ que l'API ne promet pas.
 */
async function discoverTeamId(
  request: APIRequestContext
): Promise<string | null> {
  const res = await request.get('/api/teams?limit=1');
  if (!res.ok()) return null;
  const body = await res.json();
  const teams = (Array.isArray(body) ? body : (body?.data ?? [])) as Array<{
    id?: string;
  }>;
  return teams[0]?.id ?? null;
}

/**
 * Aucune photo TCG appartenant à QUELQU'UN D'AUTRE ne doit apparaître dans le
 * HTML servi.
 *
 * `expectedOwnerId` à `null` = aucune photo TCG n'est attendue du tout (page
 * d'équipe : une carte d'équipe s'illustre de son logo, jamais du portrait
 * d'une joueuse).
 *
 * Assertion vacante si la base ne contient aucune photo approuvée — c'est
 * assumé : elle sert de filet le jour où il y en a, et ne peut pas produire de
 * faux positif entre-temps.
 */
async function assertNoForeignTcgPhoto(
  page: Page,
  expectedOwnerId: string | null
) {
  const html = await page.content();
  const owners = [...html.matchAll(TCG_PHOTO_URL_RE)].map((m) =>
    m[1].toLowerCase()
  );

  if (expectedOwnerId === null) {
    expect(
      owners,
      'aucune photo TCG de joueuse ne doit être servie sur cette page'
    ).toEqual([]);
    return;
  }

  for (const owner of owners) {
    expect(
      owner,
      `photo TCG servie pour ${owner} sur la fiche de ${expectedOwnerId}`
    ).toBe(expectedOwnerId.toLowerCase());
  }
}

test.describe('TCG — espace joueuse (protégé)', () => {
  test('« Mon TCG » renvoie vers la connexion quand on n’est pas connecté', async ({
    page,
  }) => {
    await page.goto('/player/tcg');

    // La garde est côté client (`usePlayerSession`), déclenchée une fois la
    // session résolue : on attend l'URL, pas un délai arbitraire.
    await page.waitForURL(/\/login/, { timeout: 20000 });

    // La cible de retour est conservée, sinon la connexion perdrait
    // l'intention de départ.
    expect(decodeURIComponent(page.url())).toContain('next=/player/tcg');

    // Et surtout : rien de la collection n'a été rendu au passage.
    await expect(
      page.getByRole('heading', { name: 'Ma carte à collectionner' })
    ).toHaveCount(0);
  });

  test('les API de collection refusent une visiteuse anonyme', async ({
    request,
  }) => {
    // Lectures seules, toutes protégées : la page n'est pas la seule barrière.
    for (const route of [
      '/api/player/tcg/collection',
      '/api/player/tcg/packs',
      '/api/player/tcg/wallet',
    ]) {
      const res = await request.get(route);
      expect(res.status(), `${route} doit refuser l’anonyme`).toBe(401);
    }
  });
});

test.describe('TCG — fiche publique d’une joueuse', () => {
  test('affiche « Sa carte » avec une rareté lisible, sans session', async ({
    page,
    request,
  }) => {
    const userId = await discoverPlayerId(request);
    test.skip(!userId, 'Classement vide : aucune joueuse à inspecter');

    await page.goto(`/player/${userId}`);

    const section = tcgSection(page);
    await expect(section).toBeVisible({ timeout: 20000 });

    // La carte est rendue côté serveur (ISR) : elle est là sans être connectée.
    const card = section.locator('article').first();
    await expect(card).toBeVisible();

    // Une rareté, et une seule, tirée du barème des badges.
    await expect(card.getByText(RARITY_LABEL_RE).first()).toBeVisible();

    // Le barème s'applique à TOUTE joueuse, plancher `common` compris : la
    // section ne se masque jamais.
    await expect(section.getByText(/rareté suit ses badges/i)).toBeVisible();
  });

  test('la carte de la fiche ne pointe pas vers la page courante', async ({
    page,
    request,
  }) => {
    const userId = await discoverPlayerId(request);
    test.skip(!userId, 'Classement vide : aucune joueuse à inspecter');

    await page.goto(`/player/${userId}`);
    const section = tcgSection(page);
    await expect(section).toBeVisible({ timeout: 20000 });

    // `noLink` : la carte est déjà sur la page de son sujet, un lien vers
    // soi-même n'apprendrait rien et ajouterait une cible de tabulation.
    await expect(section.locator(`a[href="/player/${userId}"]`)).toHaveCount(0);
  });

  test('le raccourci « Gérer ma photo » reste privé à la joueuse', async ({
    page,
    request,
  }) => {
    const userId = await discoverPlayerId(request);
    test.skip(!userId, 'Classement vide : aucune joueuse à inspecter');

    await page.goto(`/player/${userId}`);
    await expect(tcgSection(page)).toBeVisible({ timeout: 20000 });

    // Visiteuse anonyme : pas de lien vers l'espace de gestion de la photo.
    await expect(
      page.getByRole('link', { name: 'Gérer ma photo de carte' })
    ).toHaveCount(0);
  });

  test('aucune photo TCG d’une autre joueuse ne fuit dans le HTML', async ({
    page,
    request,
  }) => {
    const userId = await discoverPlayerId(request);
    test.skip(!userId, 'Classement vide : aucune joueuse à inspecter');

    await page.goto(`/player/${userId}`);
    await expect(tcgSection(page)).toBeVisible({ timeout: 20000 });

    await assertNoForeignTcgPhoto(page, userId!);
  });

  test('la photo TCG reste hors de l’API partenaire', async ({ request }) => {
    const userId = await discoverPlayerId(request);
    test.skip(!userId, 'Classement vide : aucune joueuse à inspecter');

    // Une joueuse consent à illustrer SES CARTES sur le site, pas à voir sa
    // photo servie dans un flux pour tiers, moissonnable et hors du retrait
    // qu'elle contrôle. `tcgPhotoUrl` est donc une prop de page, jamais un
    // champ de `PlayerProfileResponse` (cf. getStaticProps de /player/[userId]).
    const res = await request.get(`/api/public/v1/players/${userId}`);
    expect(res.ok()).toBeTruthy();

    const raw = await res.text();
    expect(raw).not.toContain('teams-images/tcg/');
    expect(raw).not.toContain('tcgPhotoUrl');
  });
});

test.describe('TCG — page publique d’une équipe', () => {
  test('affiche « Sa carte » avec une rareté lisible', async ({
    page,
    request,
  }) => {
    const teamId = await discoverTeamId(request);
    test.skip(!teamId, 'Aucune équipe active à inspecter');

    // L'UUID redirige (308) vers l'URL canonique : on suit la redirection.
    await page.goto(`/team/${teamId}`);

    const section = tcgSection(page);
    await expect(section).toBeVisible({ timeout: 20000 });

    const card = section.locator('article').first();
    await expect(card).toBeVisible();
    await expect(card.getByText(RARITY_LABEL_RE).first()).toBeVisible();

    // Même barème que les joueuses — c'est ce que dit le texte d'accompagnement.
    await expect(
      section.getByText(/palmarès et son classement/i)
    ).toBeVisible();
  });

  test('la carte d’équipe n’expose aucune photo de joueuse', async ({
    page,
    request,
  }) => {
    const teamId = await discoverTeamId(request);
    test.skip(!teamId, 'Aucune équipe active à inspecter');

    await page.goto(`/team/${teamId}`);
    await expect(tcgSection(page)).toBeVisible({ timeout: 20000 });

    // Une carte d'équipe s'illustre de son logo. Aucune photo TCG, de personne.
    await assertNoForeignTcgPhoto(page, null);
  });
});

test.describe('TCG — chemins dégradés', () => {
  test('une joueuse inconnue rend un 404, pas une carte vide', async ({
    page,
  }) => {
    const res = await page.goto(`/player/${UNKNOWN_USER_ID}`);
    expect(res?.status()).toBe(404);

    await expect(
      page.getByRole('heading', { name: 'Sa carte', exact: true })
    ).toHaveCount(0);
  });

  test('une équipe inconnue rend un 404, pas une carte vide', async ({
    page,
  }) => {
    const res = await page.goto(
      `/team/e2e-tcg-equipe-inexistante-${Date.now()}`
    );
    expect(res?.status()).toBe(404);

    await expect(
      page.getByRole('heading', { name: 'Sa carte', exact: true })
    ).toHaveCount(0);
  });

  test('un identifiant de joueuse malformé ne casse pas l’API partenaire', async ({
    request,
  }) => {
    const res = await request.get('/api/public/v1/players/pas-un-uuid');
    expect(res.status()).toBe(400);
  });
});
