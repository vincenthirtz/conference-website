// features/player/team/openingSchemas.ts — contrat de /api/teams/opening
// (lot P8) : l'annonce « cette équipe cherche une joueuse » posée DEPUIS
// l'espace capitaine, rattachée à l'équipe gérée (`team_openings.team_id`).
//
// Mêmes vocabulaires et mêmes bornes que le formulaire public
// (lib/apiContracts/public/teamOpenings.ts) : une capitaine qui coche
// « support » ici et une joueuse qui filtre « support » sur /recrutement
// doivent parler la même langue. Ni nom d'équipe ni email dans le corps :
// le nom vient de l'équipe gérée, l'email du compte authentifié.
//
// Imports RELATIFS : le schéma est référencé par lib/apiContracts, que le
// script de build assemble sans l'alias `@/`.

import * as z from 'zod';
import {
  TEAM_OPENING_LEVELS,
  TEAM_OPENING_LIMITS,
  TEAM_OPENING_ROLES,
  type TeamOpeningLevel,
  type TeamOpeningRole,
} from '../../../utils/teamOpenings';

/** Corps de PUT /api/teams/opening (création OU mise à jour). */
export const TeamOpeningUpsertBody = z.object({
  // Au moins un poste : une annonce sans poste n'aide aucune joueuse à savoir
  // si elle est concernée (même règle que le formulaire public).
  roles: z
    .array(z.enum(TEAM_OPENING_ROLES), {
      error: 'Choisis au moins un poste recherché.',
    })
    .min(1, 'Choisis au moins un poste recherché.')
    .max(TEAM_OPENING_ROLES.length),
  level: z.enum(TEAM_OPENING_LEVELS, { error: 'Niveau invalide.' }).optional(),
  availability: z
    .string()
    .trim()
    .max(TEAM_OPENING_LIMITS.availability)
    .nullish(),
  note: z.string().trim().max(TEAM_OPENING_LIMITS.note).nullish(),
  contactDiscord: z
    .string()
    .trim()
    .max(TEAM_OPENING_LIMITS.contactDiscord)
    .nullish(),
});
export type TeamOpeningUpsertInput = z.infer<typeof TeamOpeningUpsertBody>;

/** L'annonce de l'équipe telle que la voit son encadrement. */
export type TeamOpeningDto = {
  id: string;
  roles: TeamOpeningRole[];
  level: TeamOpeningLevel | null;
  availability: string | null;
  note: string | null;
  contactDiscord: string | null;
  /** Email de contact enregistré (celui du compte qui a publié). */
  contactEmail: string | null;
  since: string | null;
  expiresAt: string | null;
  /** `false` = périmée : invisible publiquement tant qu'elle n'est pas renouvelée. */
  active: boolean;
};

/** Réponse de GET / PUT /api/teams/opening. */
export type TeamOpeningResponse = {
  opening: TeamOpeningDto | null;
  /**
   * Email qui servira de contact si l'appelante publie : on l'affiche AVANT
   * la publication pour qu'elle sache ce qui sera partagé.
   */
  accountEmail: string | null;
};
