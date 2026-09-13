// utils/heroes/recommendCardHero.ts
//
// QUEL PERSONNAGE REPRÉSENTE UNE JOUEUSE qui ne dépose pas de photo.
//
// Réducteur PUR (aucune I/O), comme `utils/tcg/rarity.ts` : l'appelant fournit
// ce qu'il a lu, cette fonction se contente de choisir. C'est ce qui la rend
// testable sans base et réutilisable côté carte comme côté profil.
//
// L'ORDRE DE PRIORITÉ EST UNE DÉCISION, pas une commodité :
//
//   1. LES PICKS DE LA JOUEUSE D'ABORD. Elle a déclaré les héros qui la
//      représentent : rien ne dit mieux qu'elle-même ce qui la représente. On
//      prend le premier, l'ordre de la liste étant sa préférence décroissante.
//
//   2. SON RÔLE ENSUITE, et seulement à défaut. `team_members.specialty` dit
//      « tank » ou « support », pas quel héros — c'est donc un repli, jamais un
//      choix : on n'affirme pas qu'une joueuse EST Reinhardt parce qu'elle joue
//      tank. D'où le champ `source` dans le résultat, qui laisse l'interface
//      formuler différemment un choix assumé et une suggestion.
//
//   3. RIEN, sinon. Aucune préférence, aucun rôle : on ne tire pas un héros au
//      hasard. Attribuer un personnage à quelqu'un qui n'a rien demandé serait
//      exactement ce que le socle refuse depuis l'origine — la carte retombe
//      sur l'avatar public, puis sur un aplat de marque.
//
// LES BANS SONT TOUJOURS RESPECTÉS, y compris sur un repli par rôle. Bannir un
// héros, c'est dire « pas celui-là pour moi » : proposer quand même un banni
// parce qu'il correspond au rôle viderait le ban de son sens.
//
// CE MODULE NE CHOISIT PAS D'IMAGE. Il rend un NOM de héros ; associer une
// illustration est une autre affaire, et le dépôt n'utilise aucune imagerie
// générée (cf. l'en-tête de `components/tcg/TcgCard.tsx`).

import {
  OVERWATCH_HEROES,
  getOverwatchHero,
  specialtyToRoles,
  type OverwatchHero,
} from './overwatch';

export type HeroRecommendation = {
  hero: OverwatchHero;
  /**
   * `pick` = la joueuse l'a explicitement choisi ; `role` = déduit de sa
   * spécialité, donc une SUGGESTION. L'interface ne doit pas présenter les deux
   * de la même façon.
   */
  source: 'pick' | 'role';
};

/**
 * Le héros qui représente une joueuse, ou `null` si rien ne permet de le dire.
 *
 * Défensive par construction : un nom inconnu dans les picks (héros retiré du
 * jeu, saisie ancienne) est ignoré plutôt que de faire échouer la
 * recommandation — mieux vaut passer au suivant que ne rien rendre.
 */
export function recommendCardHero(input: {
  /** Ordre de préférence décroissant. */
  picks?: readonly string[] | null;
  bans?: readonly string[] | null;
  /** `team_members.specialty` : tank | dps | support | flex | null. */
  specialty?: string | null;
}): HeroRecommendation | null {
  const banned = new Set(input.bans ?? []);

  // 1) Ce qu'elle a choisi, dans son ordre.
  for (const name of input.picks ?? []) {
    if (banned.has(name)) continue; // contradiction : le ban l'emporte
    const hero = getOverwatchHero(name);
    if (hero) return { hero, source: 'pick' };
  }

  // 2) Repli par rôle. `flex` et une spécialité absente rendent les trois rôles
  //    (cf. `specialtyToRoles`) : dans ce cas on ne suggère RIEN, parce que
  //    « n'importe quel héros du jeu » n'est pas une suggestion.
  const roles = specialtyToRoles(input.specialty);
  if (roles.length !== 1) return null;

  const candidates = OVERWATCH_HEROES.filter(
    (h) => h.role === roles[0] && !banned.has(h.name)
  );
  // Le premier du référentiel, donc STABLE : deux appels rendent le même héros.
  // Un tirage aléatoire ferait changer la carte d'une visite à l'autre.
  return candidates.length > 0 ? { hero: candidates[0], source: 'role' } : null;
}
