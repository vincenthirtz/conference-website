// utils/tcg/fanartTargets.ts
//
// LA CIBLE D'UNE FAN ART, VUE PAR LES REGISTRES : le slug désigne-t-il un
// héros ou une map qui existe, et que doit écrire la face ?
//
// LES MÊMES REGISTRES QUE LES CARTES DU JEU, JAMAIS UNE COPIE. Un héros visé
// est un héros des cartes héros (`heroCards.ts`, dérivé du référentiel
// `utils/heroes/overwatch.ts`) ; une map visée est une map du pool des cartes
// de map (`readMapFaces.ts`, registre `config/maps/overwatch.ts`). Le slug
// stocké est donc EXACTEMENT celui de la carte du jeu correspondante — `hero:
// mercy` et une variante `target_slug = 'mercy'` parlent du même héros.
//
// UN SUJET SORTI DU REGISTRE RESTE UNE CARTE. La cible n'est pas une clé
// étrangère (les registres vivent dans le code) : une map retirée du pool
// laisse des variantes dont la face retombe sur le titre de l'œuvre, sans nom
// de cible — même contrat que les cartes héros et mascottes orphelines. Seule
// l'ÉCRITURE d'une cible exige qu'elle existe.
//
// Pur : aucune entrée-sortie.

import type { OverwatchRole } from '../heroes/overwatch';
import type {
  FanartTargetKind,
  FanartTargetRef,
  FanartTargetView,
} from './fanart';
import { HERO_CARD_SLUGS, heroCardOf } from './heroCards';
import { MAP_POOL_SLUGS, isKnownMapSlug, mapFace } from './readMapFaces';

/** Le slug désigne-t-il un sujet existant de ce type ? */
export function isKnownFanartTarget(ref: FanartTargetRef): boolean {
  if (ref.kind === 'hero') return heroCardOf(ref.slug) !== null;
  if (ref.kind === 'map') return isKnownMapSlug(ref.slug);
  return false;
}

/**
 * La cible telle que la face l'affiche. `null` sans cible ; `name` (et `role`)
 * à `null` pour un sujet sorti du registre.
 */
export function resolveFanartTarget(
  ref: FanartTargetRef | null
): FanartTargetView | null {
  if (!ref) return null;
  if (ref.kind === 'hero') {
    const hero = heroCardOf(ref.slug);
    return {
      kind: 'hero',
      slug: ref.slug,
      name: hero?.name ?? null,
      role: hero?.role ?? null,
    };
  }
  return {
    kind: 'map',
    slug: ref.slug,
    // `mapFace` rend le slug en guise de nom pour une map inconnue ; ici, une
    // cible inconnue n'a PAS de nom — la carte garde alors le titre de l'œuvre.
    name: isKnownMapSlug(ref.slug) ? mapFace(ref.slug).name : null,
    role: null,
  };
}

export type FanartTargetOption = {
  kind: FanartTargetKind;
  slug: string;
  name: string;
  role: OverwatchRole | null;
};

/**
 * Tout ce qu'une fan art peut illustrer, dans l'ordre des registres (héros
 * par rôle, puis maps) : le sélecteur de la proposition et celui du staff.
 */
export function fanartTargetOptions(): Record<
  FanartTargetKind,
  FanartTargetOption[]
> {
  const heroes: FanartTargetOption[] = [];
  for (const slug of HERO_CARD_SLUGS) {
    const hero = heroCardOf(slug);
    if (hero) {
      heroes.push({ kind: 'hero', slug, name: hero.name, role: hero.role });
    }
  }
  const maps: FanartTargetOption[] = MAP_POOL_SLUGS.map((slug) => ({
    kind: 'map',
    slug,
    name: mapFace(slug).name,
    role: null,
  }));
  // Un type ajouté à `FANART_TARGET_KINDS` sans options ici est une erreur de
  // compilation (le `Record`), pas un sélecteur qui l'oublierait en silence.
  return { hero: heroes, map: maps };
}
