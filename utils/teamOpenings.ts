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
//
// Ce module porte AUSSI les projections, et pour une raison de confidentialité :
// ces rows sont lues par deux surfaces aux exigences opposées — la page publique
// (anonymisée) et la route de contact (authentifiée). Centraliser les
// projections évite qu'un `select('*')` distrait ne fasse fuiter un email.

import {
  FREE_PLAYER_LEVELS,
  FREE_PLAYER_ROLES,
  isFreePlayerLevel,
  normalizeRoles,
  type FreePlayerLevel,
  type FreePlayerRole,
} from './freePlayers';

/** Postes RECHERCHÉS par l'équipe. Mêmes valeurs que les postes joués. */
export const TEAM_OPENING_ROLES = FREE_PLAYER_ROLES;
export type TeamOpeningRole = FreePlayerRole;

/** Niveau approximatif de l'équipe — même échelle que celle des joueuses. */
export const TEAM_OPENING_LEVELS = FREE_PLAYER_LEVELS;
export type TeamOpeningLevel = FreePlayerLevel;

/**
 * Provenances. Seul `web` est écrit aujourd'hui (formulaire public) ; `discord`
 * est réservé à un futur push du bot et existe déjà dans le CHECK de la table
 * pour ne pas imposer une migration ce jour-là.
 */
export const TEAM_OPENING_SOURCES = ['web', 'discord'] as const;
export type TeamOpeningSource = (typeof TEAM_OPENING_SOURCES)[number];

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

/** Date de péremption d'une annonce créée maintenant. */
export function computeTeamOpeningExpiresAt(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + TEAM_OPENING_TTL_DAYS);
  return d.toISOString();
}

/**
 * Normalise une liste de postes recherchés. Délègue à `normalizeRoles` des
 * joueuses libres : même filtrage de l'inconnu, même déduplication, même ordre
 * canonique — deux annonces qui cochent les mêmes cases s'affichent pareil.
 */
export function normalizeOpeningRoles(input: unknown): TeamOpeningRole[] {
  return normalizeRoles(input);
}

/** Row telle que lue en base (colonnes utiles seulement). */
export type TeamOpeningRow = {
  id: string;
  source: string | null;
  team_id: string | null;
  team_name: string | null;
  roles: string[] | null;
  level: string | null;
  availability: string | null;
  note: string | null;
  contact_email: string | null;
  contact_discord: string | null;
  marked_at: string | null;
  expires_at: string | null;
};

/** Colonnes à sélectionner pour construire l'une ou l'autre projection. */
export const TEAM_OPENING_SELECT =
  'id, source, team_id, team_name, roles, level, availability, note, contact_email, contact_discord, marked_at, expires_at';

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

export function toPublicTeamOpening(
  row: TeamOpeningRow
): PublicTeamOpening | null {
  // Un nom d'équipe affichable est la seule donnée strictement nécessaire :
  // sans elle, la ligne n'apprend rien à personne.
  const teamName = (row.team_name || '').trim();
  if (!teamName) return null;

  return {
    id: row.id,
    teamName,
    roles: normalizeOpeningRoles(row.roles),
    level: isFreePlayerLevel(row.level) ? row.level : null,
    availability: row.availability?.trim() || null,
    note: row.note?.trim() || null,
    since: row.marked_at,
  };
}

/**
 * Vue CONNECTÉE — la même annonce, plus les moyens de contact.
 *
 * Contrepartie du « sans compte » côté publication : une équipe qui publie sans
 * compte doit rester joignable, mais seulement par quelqu'un qui s'est
 * authentifié. Cette projection ne doit JAMAIS être renvoyée par une route
 * publique.
 */
export type ContactTeamOpening = PublicTeamOpening & {
  teamId: string | null;
  contact: { email: string | null; discord: string | null };
};

export function toContactTeamOpening(
  row: TeamOpeningRow
): ContactTeamOpening | null {
  const base = toPublicTeamOpening(row);
  if (!base) return null;
  return {
    ...base,
    teamId: row.team_id ?? null,
    contact: {
      email: row.contact_email?.trim() || null,
      discord: row.contact_discord?.trim() || null,
    },
  };
}

/**
 * Une annonce est-elle encore vivante ? `expires_at` nul = pas de péremption
 * (aucune row n'est écrite ainsi aujourd'hui ; la tolérance existe pour une
 * future provenance dont la fraîcheur serait garantie autrement, comme les rows
 * Discord de `free_players`).
 */
export function isTeamOpeningActive(
  row: TeamOpeningRow,
  now: Date = new Date()
): boolean {
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > now.getTime();
}
