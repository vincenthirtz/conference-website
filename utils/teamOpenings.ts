// utils/teamOpenings.ts
//
// Vocabulaire partagé du MIROIR de `free_players` : les équipes qui cherchent
// une joueuse (`/recrutement`), là où `utils/freePlayers.ts` porte les joueuses
// qui cherchent une équipe (`/rejoindre`).
//
// Les deux faces DOIVENT parler le même vocabulaire : une capitaine qui coche
// « support » sur son annonce et une joueuse qui coche « support » sur sa fiche
// se rendraient mutuellement invisibles si chacune avait sa propre énumération.
// D'où les ré-exports plutôt que des copies — le jour où un poste bouge, il ne
// bouge qu'à un seul endroit.

import {
  FREE_PLAYER_LEVELS,
  FREE_PLAYER_ROLES,
  type FreePlayerLevel,
  type FreePlayerRole,
} from './freePlayers';

/** Postes RECHERCHÉS par l'équipe. Mêmes valeurs que les postes joués. */
export const TEAM_OPENING_ROLES = FREE_PLAYER_ROLES;
export type TeamOpeningRole = FreePlayerRole;

/** Niveau approximatif de l'équipe — même échelle que celle des joueuses. */
export const TEAM_OPENING_LEVELS = FREE_PLAYER_LEVELS;
export type TeamOpeningLevel = FreePlayerLevel;

/** Durée de vie d'une annonce, en jours. Alignée sur celle des fiches joueuses. */
export const TEAM_OPENING_TTL_DAYS = 60;

/**
 * Bornes de saisie, partagées entre le schéma de validation de l'API et le
 * formulaire public. Les avoir des deux côtés évite le pire des retours : un
 * champ que le navigateur laisse remplir et que le serveur refuse ensuite.
 */
export const TEAM_OPENING_LIMITS = {
  teamName: 60,
  availability: 200,
  note: 400,
  contactDiscord: 60,
  contactEmail: 200,
} as const;

/**
 * Vue PUBLIQUE d'une annonce — celle que sert `GET /api/public/team-openings`.
 *
 * Aucun moyen de contact, exactement comme la liste des joueuses : la liste
 * prouve qu'il y a des équipes qui recrutent, elle n'ouvre pas un carnet
 * d'adresses. Le contact part de l'équipe vers la joueuse, jamais l'inverse.
 */
export type PublicTeamOpening = {
  id: string;
  teamName: string;
  roles: TeamOpeningRole[];
  level: TeamOpeningLevel | null;
  availability: string | null;
  note: string | null;
  since: string | null;
};
