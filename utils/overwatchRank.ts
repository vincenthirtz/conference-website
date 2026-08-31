// utils/overwatchRank.ts
//
// Le niveau Overwatch DÉCLARÉ d'une joueuse, et la moyenne de son équipe.
//
// À ne pas confondre avec `utils/rating/*` : celui-là est un Glicko-2 CALCULÉ
// à partir des matchs joués sur le site, il appartient au site et personne ne
// le saisit. Ici c'est l'inverse — un chiffre que l'équipe renseigne
// elle-même, celui du jeu, pour dire son niveau avant d'avoir joué quoi que ce
// soit chez nous (scrims, seeding, « on cherche des adversaires de notre
// niveau »). Les deux coexistent sans se parler ; les nommer différemment
// (`skill_rating` vs `rating`) est ce qui les empêche de se confondre à la
// lecture.
//
// L'échelle est celle du SR, 0 à 5000, parce que c'est celle que les joueuses
// citent entre elles (« je suis 3k5 »). Overwatch 2 affiche des divisions
// (Diamant 3, Maître 1…) plutôt qu'un nombre, mais personne n'annonce sa
// division dans un message de recherche de scrim. Les paliers, eux, suivent
// bien Overwatch 2 — Émeraude comprise.
//
// Module PUR : aucune I/O, aucun JSX, importable des deux côtés. Les LIBELLÉS
// de palier vivent dans l'i18n (`overwatchRank` fr/en) — ici on ne manipule
// que des clés.

import { isNonPlayingTeamRole } from './teams/roleKind';

export const SKILL_RATING_MIN = 0;
export const SKILL_RATING_MAX = 5000;

export type OverwatchTierKey =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'emerald'
  | 'diamond'
  | 'master'
  | 'grandmaster';

/**
 * Bornes INCLUSES, dans l'ordre croissant, contiguës et sans trou — la
 * contiguïté est vérifiée par le test, parce qu'un SR qui ne tomberait dans
 * aucun palier s'afficherait comme « non classé » sans que rien ne le signale.
 *
 * L'ÉMERAUDE s'intercale entre Platine et Diamant (2500-2999) : Blizzard l'a
 * ajouté pour combler l'écart de niveau béant entre le haut Platine et le bas
 * Diamant. La progression est donc Or → Platine → Émeraude → Diamant.
 *
 * Conséquence à ne pas « corriger » : l'insertion pousse tout le bas de
 * l'échelle de 500 points par rapport aux paliers d'Overwatch 1 (où l'Or
 * tenait 2000-2499). Le Bronze absorbe le reste, d'où sa largeur double.
 */
export const OVERWATCH_TIERS: ReadonlyArray<{
  key: OverwatchTierKey;
  min: number;
  max: number;
}> = [
  { key: 'bronze', min: 0, max: 999 },
  { key: 'silver', min: 1000, max: 1499 },
  { key: 'gold', min: 1500, max: 1999 },
  { key: 'platinum', min: 2000, max: 2499 },
  { key: 'emerald', min: 2500, max: 2999 },
  { key: 'diamond', min: 3000, max: 3499 },
  { key: 'master', min: 3500, max: 3999 },
  { key: 'grandmaster', min: 4000, max: 5000 },
];

/**
 * Un SR exploitable : entier, dans les bornes. `null` / `undefined` / `''` sont
 * des ABSENCES légitimes (personne n'est obligée de déclarer son niveau) et ne
 * passent pas par ici — les appelants testent `!= null` avant.
 */
export function isValidSkillRating(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SKILL_RATING_MIN &&
    value <= SKILL_RATING_MAX
  );
}

/**
 * Palier d'un SR. `null` hors bornes plutôt qu'un palier par défaut : afficher
 * « Bronze » sur une valeur aberrante ferait passer un bug pour une donnée.
 */
export function overwatchTierFromSkillRating(
  skillRating: number | null | undefined
): OverwatchTierKey | null {
  if (!isValidSkillRating(skillRating)) return null;
  const tier = OVERWATCH_TIERS.find(
    (t) => skillRating >= t.min && skillRating <= t.max
  );
  return tier?.key ?? null;
}

/**
 * SR → notation parlée : 3500 → « 3k5 », 3000 → « 3k », 4750 → « 4k7 ».
 *
 * On TRONQUE la centaine au lieu d'arrondir : « 3k4 » doit vouloir dire « au
 * moins 3400 ». Arrondir ferait afficher 3k5 à quelqu'un qui est 3450, donc
 * annoncerait Maître à un compte Diamant.
 *
 * Sous 1000 la notation n'a plus de sens (« 0k8 ») : on rend le nombre brut.
 */
export function formatSkillRating(skillRating: number): string {
  const value = Math.trunc(skillRating);
  if (value < 1000) return String(value);
  const thousands = Math.floor(value / 1000);
  const hundreds = Math.floor(value / 100) % 10;
  return hundreds === 0 ? `${thousands}k` : `${thousands}k${hundreds}`;
}

export type SkillRatedMember = {
  role?: string | null;
  skill_rating?: number | null;
};

export type TeamSkillRatingAverage = {
  /** Moyenne arrondie à l'entier — un SR est un entier. */
  average: number;
  /** Nombre de fiches ayant servi au calcul. */
  count: number;
  /** Nombre de fiches JOUANTES au total, renseignées ou non. */
  eligible: number;
  tier: OverwatchTierKey | null;
};

/**
 * Moyenne de l'équipe, sur les seules fiches JOUANTES qui ont un SR.
 *
 * Deux choix à ne pas défaire :
 *
 *   - l'encadrement est exclu (`isNonPlayingTeamRole`) : le niveau d'une coach
 *     ne dit rien du niveau de l'équipe qu'elle entraîne ;
 *   - les remplaçantes COMPTENT. Elles jouent, et restreindre aux titulaires
 *     supposerait de savoir qui commence — une information que le roster ne
 *     porte pas.
 *
 * `count` et `eligible` sont renvoyés pour que l'affichage puisse dire sur
 * combien de fiches la moyenne porte : une moyenne calculée sur 2 joueuses sur
 * 6 n'a pas la même valeur qu'une moyenne complète, et le lecteur doit pouvoir
 * en juger. `null` quand aucune fiche n'est renseignée.
 */
export function averageTeamSkillRating(
  members: ReadonlyArray<SkillRatedMember> | null | undefined
): TeamSkillRatingAverage | null {
  if (!Array.isArray(members)) return null;

  const playing = members.filter((m) => !isNonPlayingTeamRole(m?.role));
  const rated = playing.filter((m) => isValidSkillRating(m.skill_rating));
  if (rated.length === 0) return null;

  const sum = rated.reduce((acc, m) => acc + (m.skill_rating as number), 0);
  const average = Math.round(sum / rated.length);

  return {
    average,
    count: rated.length,
    eligible: playing.length,
    tier: overwatchTierFromSkillRating(average),
  };
}
