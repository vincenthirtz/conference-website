// utils/mercatoSchema.ts
//
// Fragments zod des champs du hub mercato, partagés par TOUTES les portes
// d'écriture : formulaires publics sans compte (/api/public/free-players,
// /api/public/team-openings), espace capitaine (/api/teams/opening) et bot
// (/api/bot/v1/free-players/profile, /api/bot/v1/team-openings).
//
// Une seule définition par champ, pour que la limite des 50 mots, la liste des
// postes ou celle des plateformes ne divergent jamais d'une porte à l'autre.
// Le vocabulaire vient de `utils/mercato.ts` (module pur, lu aussi par le
// site) ; ce fichier-ci porte zod et reste hors des bundles clients.
//
// Imports RELATIFS : lib/apiContracts l'importe, et le script de build de la
// spec OpenAPI assemble ces modules sans l'alias `@/`.

import * as z from 'zod';
import {
  MERCATO_INPUTS,
  MERCATO_LIMITS,
  MERCATO_PLATFORMS,
  MERCATO_POSITIONS,
  PLAYER_GENDERS,
  RANK_TIERS,
  SOUGHT_GENDERS,
  countWords,
  tierIndex,
} from './mercato';

export const GOALS_TOO_LONG = `${MERCATO_LIMITS.goalsWords} mots maximum.`;

/** « Ce que tu recherches dans une équipe » : 50 mots, vérifiés ici. */
export const goalsField = z
  .string()
  .trim()
  .max(MERCATO_LIMITS.goalsChars)
  .refine((v) => countWords(v) <= MERCATO_LIMITS.goalsWords, {
    message: GOALS_TOO_LONG,
  })
  .meta({
    description: `Texte libre, ${MERCATO_LIMITS.goalsWords} mots maximum (compte : suites de caractères séparées par des espaces).`,
  });

export const pastTeamsField = z.string().trim().max(MERCATO_LIMITS.pastTeams);

const positionsField = z
  .array(z.enum(MERCATO_POSITIONS))
  .max(MERCATO_POSITIONS.length);
const platformsField = z
  .array(z.enum(MERCATO_PLATFORMS))
  .max(MERCATO_PLATFORMS.length);
const inputsField = z.array(z.enum(MERCATO_INPUTS)).max(MERCATO_INPUTS.length);

/**
 * Champs d'une fiche joueuse. Tous facultatifs : une fiche d'avant le mercato
 * reste valide, et chaque champ manquant vaut « non renseigné ».
 */
export const playerMercatoShape = {
  gender: z.enum(PLAYER_GENDERS).optional().meta({
    description:
      'Donnée personnelle, facultative. Défaut `undisclosed` (« préfère ne pas dire ») : rien n’est affiché ni filtrable. Les autres valeurs apparaissent sur la fiche publique.',
  }),
  rankDivision: z.number().int().min(1).max(5).nullish().meta({
    description:
      'Division du palier (`level`), 5 (bas) → 1 (haut). Ignorée sans palier connu.',
  }),
  platforms: platformsField.optional(),
  inputs: inputsField.optional().meta({
    description: '`controller` = manette, `mkb` = clavier-souris.',
  }),
  mainRole: z.enum(MERCATO_POSITIONS).nullish().meta({
    description: 'Poste principal.',
  }),
  positions: positionsField.optional().meta({
    description:
      'Postes visés (tank, hitscan, flex_dps, main_heal, flex_support). Les rôles historiques `roles` en sont déduits.',
  }),
  pastTeams: pastTeamsField.nullish().meta({
    description:
      'Anciennes équipes / structures, et équipes avec qui un essai a déjà eu lieu.',
  }),
  goals: goalsField.nullish(),
};

/** Champs d'une annonce d'équipe. Tous facultatifs (cf. ci-dessus). */
export const teamMercatoShape = {
  soughtGenders: z
    .array(z.enum(SOUGHT_GENDERS))
    .max(SOUGHT_GENDERS.length)
    .optional()
    .meta({
      description:
        'Profils recherchés. `mixed` = équipe mixte. Vide = non précisé.',
    }),
  rankMin: z.enum(RANK_TIERS).nullish().meta({
    description: 'Borne basse de la fourchette de rang acceptée (palier).',
  }),
  rankMax: z.enum(RANK_TIERS).nullish().meta({
    description: 'Borne haute de la fourchette de rang acceptée (palier).',
  }),
  platforms: platformsField.optional(),
  inputs: inputsField.optional(),
  positions: positionsField.optional().meta({
    description:
      'Postes RECHERCHÉS. Les rôles historiques `roles` en sont déduits.',
  }),
};

export const RANK_RANGE_INVERTED =
  'La fourchette de rang est inversée : le rang minimum dépasse le maximum.';

/** Une fourchette de rang n'est valide que si min ≤ max (bornes posées). */
export function rankRangeIsOrdered(
  min: string | null | undefined,
  max: string | null | undefined
): boolean {
  if (!min || !max) return true;
  return tierIndex(min) <= tierIndex(max);
}

export const NO_POSITION = 'Choisis au moins un poste.';

/** Au moins un poste, par l'ancien champ `roles` ou par les nouveaux. */
export function hasAnyPosition(v: {
  roles?: readonly string[] | null;
  positions?: readonly string[] | null;
  mainRole?: string | null;
}): boolean {
  return (
    (v.roles?.length ?? 0) > 0 ||
    (v.positions?.length ?? 0) > 0 ||
    Boolean(v.mainRole)
  );
}
