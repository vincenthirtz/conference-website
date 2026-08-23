// utils/freePlayers.ts
//
// Vocabulaire et projections partagés du « marché des joueuses libres »
// (lot 1 du backlog d'acquisition, docs/BACKLOG-acquisition-joueuses.md).
//
// Une joueuse libre a deux provenances possibles :
//   - `discord` : elle porte le rôle « Recherche une équipe » sur le serveur,
//     et le bot pousse la liste complète (FULL REPLACE) vers `free_players` ;
//   - `web` : elle s'est signalée depuis /rejoindre, SANS compte requis.
//
// Ce module existe pour une raison précise : ces rows sont lues par TROIS
// surfaces aux exigences de confidentialité opposées — la page publique
// (anonymisée), l'espace capitaine (contact visible), et le bot. Centraliser
// les projections évite qu'une évolution de schéma ne fasse fuiter un email par
// un `select('*')` distrait.

/** Postes joués. Aligné sur `team_members.specialty` — même vocabulaire partout. */
export const FREE_PLAYER_ROLES = ['tank', 'dps', 'support', 'flex'] as const;
export type FreePlayerRole = (typeof FREE_PLAYER_ROLES)[number];

/**
 * Niveau approximatif. `unknown` est un choix de premier rang, pas un repli :
 * exiger un rang d'une joueuse qui débute est exactement la friction que le
 * lot 1 cherche à supprimer (cf. constat A6 — « aucun rang minimum » est vrai
 * mais invisible).
 */
export const FREE_PLAYER_LEVELS = [
  'unknown',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'grandmaster',
  'champion',
] as const;
export type FreePlayerLevel = (typeof FREE_PLAYER_LEVELS)[number];

export const FREE_PLAYER_SOURCES = ['discord', 'web'] as const;
export type FreePlayerSource = (typeof FREE_PLAYER_SOURCES)[number];

/** Durée de vie d'une annonce web, en jours. Cf. `expires_at` en migration. */
export const FREE_PLAYER_TTL_DAYS = 60;

/** Bornes de saisie, partagées entre le schéma zod de l'API et le formulaire. */
export const FREE_PLAYER_LIMITS = {
  displayName: 40,
  availability: 200,
  note: 400,
  contactDiscord: 60,
  contactEmail: 200,
} as const;

export function isFreePlayerRole(value: unknown): value is FreePlayerRole {
  return (
    typeof value === 'string' &&
    (FREE_PLAYER_ROLES as readonly string[]).includes(value)
  );
}

export function isFreePlayerLevel(value: unknown): value is FreePlayerLevel {
  return (
    typeof value === 'string' &&
    (FREE_PLAYER_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Normalise une liste de postes : garde les valeurs connues, déduplique, et
 * conserve l'ordre canonique de `FREE_PLAYER_ROLES` plutôt que celui de saisie
 * (deux joueuses qui cochent les mêmes cases s'affichent pareil).
 */
export function normalizeRoles(input: unknown): FreePlayerRole[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.filter(isFreePlayerRole));
  return FREE_PLAYER_ROLES.filter((role) => picked.has(role));
}

/** Date de péremption d'une annonce créée maintenant. */
export function computeExpiresAt(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + FREE_PLAYER_TTL_DAYS);
  return d.toISOString();
}

/** Row telle que lue en base (colonnes utiles seulement). */
export type FreePlayerRow = {
  id: string;
  source: string | null;
  discord_user_id: string | null;
  discord_username: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  roles: string[] | null;
  availability: string | null;
  level: string | null;
  note: string | null;
  contact_email: string | null;
  contact_discord: string | null;
  marked_at: string | null;
  expires_at: string | null;
};

/**
 * Vue PUBLIQUE — celle qui part sur /rejoindre, sans authentification.
 *
 * Ne contient AUCUN moyen de contact : ni email, ni tag Discord, ni identifiant
 * Discord. Le but de la liste publique est de prouver qu'il y a du monde, pas
 * d'ouvrir un carnet d'adresses. Prendre contact passe par une capitaine
 * connectée (cf. `toCaptainFreePlayer`).
 */
export type PublicFreePlayer = {
  id: string;
  name: string;
  roles: FreePlayerRole[];
  level: FreePlayerLevel | null;
  availability: string | null;
  note: string | null;
  since: string | null;
};

export function toPublicFreePlayer(row: FreePlayerRow): PublicFreePlayer | null {
  // Un nom affichable est la seule donnée strictement nécessaire : sans elle,
  // la ligne n'apprend rien à personne. Les rows Discord non liées peuvent ne
  // porter qu'un pseudo Discord — ça suffit.
  const name = (row.display_name || row.discord_username || '').trim();
  if (!name) return null;

  return {
    id: row.id,
    name,
    roles: normalizeRoles(row.roles),
    level: isFreePlayerLevel(row.level) ? row.level : null,
    availability: row.availability?.trim() || null,
    note: row.note?.trim() || null,
    since: row.marked_at,
  };
}

/** Colonnes à sélectionner pour construire l'une ou l'autre projection. */
export const FREE_PLAYER_SELECT =
  'id, source, discord_user_id, discord_username, auth_user_id, display_name, roles, availability, level, note, contact_email, contact_discord, marked_at, expires_at';

/**
 * Une annonce est-elle encore vivante ? `expires_at` nul = pas de péremption
 * (cas des rows Discord, dont la fraîcheur est garantie par la synchro du bot :
 * perdre le rôle retire la row).
 */
export function isActive(row: FreePlayerRow, now: Date = new Date()): boolean {
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > now.getTime();
}
