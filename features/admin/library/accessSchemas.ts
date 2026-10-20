// features/admin/library/accessSchemas.ts — L'ACCÈS à la Women's Library,
// réglé par le staff sans redéployer (lot 14c de docs/PLAN-womens-library.md,
// conference-website : « une bêta par liste »).
//
//   GET / PUT /api/admin/library/access
//
// Quatre modes, du plus fermé au plus ouvert :
//   * `owner` — DÉFAUT : la propriétaire de l'association seule ;
//   * `staff` — owner ou admin ;
//   * `beta`  — owner, admin, les joueuses de la liste et les membres
//     ACCEPTÉES des équipes de la liste ;
//   * `all`   — ouverte (la porte — âge, attestation, bannissement — s'applique
//     toujours).
//
// zod seul, imports RELATIFS : schémas référencés par la spec OpenAPI, copie
// synchronisée vers le site (le panneau valide avec les mêmes bornes). Le
// MÊME schéma relit la valeur stockée (`LibraryAccessStored`) : ce que la
// route refuse d'écrire, la porte refuse de le lire.

import * as z from 'zod';

export const LIBRARY_ACCESS_MODES = ['owner', 'staff', 'beta', 'all'] as const;
export type LibraryAccessMode = (typeof LIBRARY_ACCESS_MODES)[number];

/** Une bêta FERMÉE : quelques équipes, quelques joueuses. */
export const LIBRARY_ACCESS_MAX_TEAMS = 20;
export const LIBRARY_ACCESS_MAX_PLAYERS = 200;
/** Pseudos à résoudre en un enregistrement (ajout un par un, en pratique). */
export const LIBRARY_ACCESS_MAX_NICKNAMES = 10;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (message: string) =>
  z.string({ error: message }).regex(UUID_RE, { error: message });

const mode = z.enum(LIBRARY_ACCESS_MODES, { error: 'Mode invalide.' });
const teamIds = z
  .array(uuid('Équipe invalide.'), { error: 'Liste d’équipes invalide.' })
  .max(LIBRARY_ACCESS_MAX_TEAMS, {
    error: `${LIBRARY_ACCESS_MAX_TEAMS} équipes au plus.`,
  });
const userIds = z
  .array(uuid('Identifiant de compte invalide.'), {
    error: 'Liste de joueuses invalide.',
  })
  .max(LIBRARY_ACCESS_MAX_PLAYERS, {
    error: `${LIBRARY_ACCESS_MAX_PLAYERS} joueuses au plus.`,
  });
const rev = z
  .number({ error: 'Version invalide.' })
  .int({ error: 'Version invalide.' })
  .min(0, { error: 'Version invalide.' });

/**
 * PUT /api/admin/library/access — REMPLACE le réglage de l'espace.
 *
 * `rev` : la version lue par le GET. Si quelqu'un a enregistré entre-temps,
 * la route répond 409 `library_access_conflict` et n'écrit rien : une liste
 * périmée ne réintroduit pas en silence une joueuse qu'on vient de retirer.
 *
 * `nicknames` : des joueuses désignées par leur pseudo de la Library (avatar
 * déjà créé dans l'espace), résolues en identifiants à l'enregistrement ; un
 * pseudo inconnu répond 404 `player_not_found`. Une joueuse qui n'est jamais
 * entrée n'a pas de pseudo : on la désigne par son identifiant de compte.
 */
export const LibraryAccessUpdateBody = z.object({
  mode,
  teamIds,
  userIds,
  nicknames: z
    .array(
      z
        .string({ error: 'Pseudo invalide.' })
        .trim()
        .min(3, { error: 'Pseudo invalide.' })
        .max(20, { error: 'Pseudo invalide.' }),
      { error: 'Pseudos invalides.' }
    )
    .max(LIBRARY_ACCESS_MAX_NICKNAMES, {
      error: `${LIBRARY_ACCESS_MAX_NICKNAMES} pseudos au plus.`,
    })
    .optional(),
  rev,
});
export type LibraryAccessUpdateInput = z.infer<typeof LibraryAccessUpdateBody>;

/**
 * La valeur STOCKÉE (`site_settings`, clé `library_access`, en JSON). Une
 * valeur qui ne la respecte pas est ILLISIBLE : la porte applique `owner`.
 */
export const LibraryAccessStored = z.object({
  mode,
  teamIds,
  userIds,
  rev,
});
export type LibraryAccessStoredValue = z.infer<typeof LibraryAccessStored>;
