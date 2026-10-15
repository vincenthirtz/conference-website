// utils/tcg/heroCards.ts
//
// LES CARTES HÉROS : une carte par héros jouable d'Overwatch, illustrée par sa
// figurine voxel (`heroFigures.ts`).
//
// UN REGISTRE DÉRIVÉ, PAS UNE TROISIÈME LISTE. Les héros existent déjà deux
// fois : le référentiel (`utils/heroes/overwatch.ts`, nom + rôle) et les
// figurines sculptées (`HERO_FIGURE_SLUGS`). Une carte héros est leur
// INTERSECTION, calculée ici par la dérivation de slug qui existe déjà
// (`heroFigureSlugFromName`) — jamais une liste recopiée qui finirait par
// diverger des deux autres. Conséquences voulues :
//   - un héros ajouté au référentiel SANS figurine n'a pas (encore) de carte :
//     une carte héros sans image serait une carte vide ;
//   - une figurine sans entrée au référentiel n'en a pas non plus : sans nom ni
//     rôle, la carte ne saurait pas quoi écrire.
// Au 2026-10-15, les 54 héros du référentiel sont tous sculptés.
//
// LE VIVIER EST CE REGISTRE, comme celui des maps et des mascottes : aucune
// table, aucune requête. Le slug n'est PAS une clé étrangère en base
// (`tcg_pack_cards.card_hero_slug`) : un héros retiré d'ici laisse des cartes
// orphelines qui s'afficheront sans nom — même contrat que les mascottes.
//
// LE TIRAGE N'EN TIENT PAS COMPTE TOUT SEUL : tant que la migration
// `tcg_hero_cards.sql` n'est pas appliquée, ce registre existe mais les cartes
// héros ne sortent d'aucun paquet (`heroCardsReady.ts`, `readDrawPool.ts`).
//
// Pur : aucune entrée-sortie. Imports RELATIFS, comme `heroFigures.ts` et
// `gameMascots.ts` : un script Node de rendu ne résout pas l'alias `@/`.

import { OVERWATCH_HEROES, type OverwatchRole } from '../heroes/overwatch';
import {
  heroFigureSlugFromName,
  heroFigureUrl,
  isHeroFigureSlug,
  type HeroFigureSlug,
} from './heroFigures';

/** Une carte héros : ce que la face affiche, rien de plus. */
export type HeroCardEntry = {
  slug: HeroFigureSlug;
  /** Le nom du référentiel, tel quel (« Soldier: 76 », « D.Va »). */
  name: string;
  /** Le rôle tel que le JEU l'écrit — la traduction est l'affaire de l'écran. */
  role: OverwatchRole;
};

/**
 * Le registre, dans l'ordre du référentiel (tanks, dégâts, soutiens).
 *
 * Dédoublonné par slug : deux noms du référentiel qui donneraient le même slug
 * ne doivent pas faire deux cartes du même sujet — la seconde serait
 * introuvable par sa clé (`hero:<slug>`).
 */
const HERO_CARDS: readonly HeroCardEntry[] = (() => {
  const seen = new Set<string>();
  const out: HeroCardEntry[] = [];
  for (const hero of OVERWATCH_HEROES) {
    const slug = heroFigureSlugFromName(hero.name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: hero.name, role: hero.role });
  }
  return out;
})();

/** Les slugs des cartes héros : le vivier du tirage, quand il est ouvert. */
export const HERO_CARD_SLUGS: readonly HeroFigureSlug[] = HERO_CARDS.map(
  (h) => h.slug
);

const BY_SLUG = new Map<string, HeroCardEntry>(
  HERO_CARDS.map((h) => [h.slug, h])
);

/** La carte héros de ce slug, ou `null` s'il n'en désigne aucune. */
export function heroCardOf(
  slug: string | null | undefined
): HeroCardEntry | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}

/**
 * Nom lisible d'un slug. `null` pour un slug inconnu : une carte tirée avant
 * qu'un héros quitte le registre s'affiche sans nom plutôt qu'avec un slug brut
 * (même règle que `gameMascotDisplayName`).
 */
export function heroCardDisplayName(slug: string): string | null {
  return heroCardOf(slug)?.name ?? null;
}

/** Rôle d'un slug (« Tank » / « Damage » / « Support »), ou `null`. */
export function heroCardRole(slug: string): OverwatchRole | null {
  return heroCardOf(slug)?.role ?? null;
}

/**
 * L'URL de la figurine d'une carte héros, ou `null` pour un slug sans
 * figurine. La route `/api/tcg/hero/...` sert déjà les figurines des cartes de
 * joueuses : une carte héros montre exactement le même dessin.
 */
export function heroCardImageUrl(slug: string): string | null {
  return isHeroFigureSlug(slug) ? heroFigureUrl(slug) : null;
}
