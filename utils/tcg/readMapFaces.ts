// utils/tcg/readMapFaces.ts
//
// La FACE d'une carte de MAP : ce qu'on affiche d'une map du pool.
//
// AUCUNE ENTRÉE-SORTIE, CONTRAIREMENT À SES DEUX VOISINS. `readPlayerFaces` et
// `readTeamFaces` interrogent la base ; ici le registre est en mémoire
// (`config/maps/overwatch.ts`), parce qu'Overwatch n'expose aucune API de maps
// et que les maquettes sont pré-rendues au build. La fonction reste `async` et
// garde la même forme que les deux autres pour que les appelants les traitent
// pareil — un `Promise.all` de trois lecteurs se lit mieux que deux lecteurs et
// un cas particulier.
//
// PAS DE PROBLÈME DE CONSENTEMENT ICI, et c'est la différence de fond avec les
// cartes de joueuses : une maquette voxel est un dessin généré par le projet,
// pas l'image d'une personne. Rien à filtrer, rien à révoquer.
//
// UNE MAP INCONNUE RESTE UNE CARTE. Si un slug tiré autrefois disparaît du
// registre (map retirée du pool), on rend son slug en guise de nom et AUCUNE
// image plutôt que de pointer vers un fichier absent : la carte s'affiche
// dégradée, elle ne casse pas la collection qui la contient.

import { OVERWATCH_RECIPES } from '@/config/maps/overwatch';

export type MapFace = {
  slug: string;
  /** Nom lisible ; le slug lui-même si la map a quitté le registre. */
  name: string;
  /** Maquette voxel pré-rendue, ou `null` pour une map inconnue. */
  imageUrl: string | null;
  /** Mode de jeu (`control`, `escort`, …) ; `null` si inconnu. */
  layout: string | null;
};

/** Index par slug — le registre ne change pas à l'exécution. */
const BY_SLUG = new Map(OVERWATCH_RECIPES.map((r) => [r.slug, r]));

/**
 * Tous les slugs tirables, dans l'ordre du registre.
 *
 * C'est le VIVIER des cartes de map, et le dénominateur de la progression de
 * collection doit lire cette même liste : deux comptages séparés finiraient par
 * promettre des cartes que le tirage ne peut pas donner.
 */
export const MAP_POOL_SLUGS: readonly string[] = OVERWATCH_RECIPES.map(
  (r) => r.slug
);

/** Ce slug désigne-t-il une map du registre ? */
export function isKnownMapSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && BY_SLUG.has(slug);
}

/** La face d'une seule map. */
export function mapFace(slug: string): MapFace {
  const recipe = BY_SLUG.get(slug);
  if (!recipe) {
    return { slug, name: slug, imageUrl: null, layout: null };
  }
  return {
    slug,
    name: recipe.name,
    // Chemin des maquettes pré-rendues (`npm run maps:render`).
    imageUrl: `/img/maps/overwatch/${recipe.slug}.svg`,
    layout: recipe.layout ?? null,
  };
}

/**
 * Les faces des maps demandées. Ne lève jamais.
 *
 * `async` par symétrie avec `readPlayerFaces` / `readTeamFaces` — cf. l'en-tête.
 */
export async function readMapFaces(
  slugs: readonly string[]
): Promise<Map<string, MapFace>> {
  const faces = new Map<string, MapFace>();
  for (const slug of new Set(slugs)) faces.set(slug, mapFace(slug));
  return faces;
}
