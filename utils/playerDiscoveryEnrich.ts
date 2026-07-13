// utils/playerDiscoveryEnrich.ts
//
// Enrichissement PARTAGÉ des cartes de l'annuaire de découverte joueur
// (cross-tenant, derrière login). Utilisé par :
//   - pages/api/player/discovery/search.ts  (annuaire filtré)
//   - pages/api/player/follows/index.ts     (listes following / followers)
//
// Toute la logique « aucun N+1 » vit ici : pour une page de N joueurs on émet
// au plus quatre requêtes bulk, jamais une par joueur :
//   1. player_ratings         .in('user_id', ids)            (stats agrégées)
//   2. team_members           .in('user_id', ids) + embed teams(name, slug)
//   3. player_follows         .in('followee_id', ids)        (followerCount)
//   4. player_follows         .eq(follower=me).in(followee, ids) (isFollowing)
//   + getDiscordLinksForUsers (bulk) pour discordUsername.
//
// Règles produit :
//   - stats omises quand show_ratings=false sur la ligne du joueur.
//   - teams omises quand show_teams=false ; sinon cap à MAX_TEAMS_PER_CARD.
//   - isFollowing = est-ce que le caller suit ce joueur.
//   - followerCount = nombre total de followers du joueur.
//   - le caller lui-même n'apparaît jamais comme suivable (les appelants
//     filtrent leur propre id en amont, mais isFollowing/self reste faux).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';

/** Ligne de player_discovery_profiles nécessaire à la construction d'une carte. */
export type DiscoveryProfileRow = {
  auth_user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  tagline?: string | null;
  show_ratings?: boolean | null;
  show_teams?: boolean | null;
};

export type PlayerStats = {
  games: number;
  peakRating: number;
  tenants: number;
};
export type PlayerTeam = { name: string; slug: string | null };

/** Forme exposée d'un joueur dans l'annuaire ET dans les listes de suivi. */
export type DirectoryPlayer = {
  authUserId: string;
  displayName: string;
  avatarUrl: string | null;
  tagline: string | null;
  discordUsername: string | null;
  stats?: PlayerStats;
  teams?: PlayerTeam[];
  isFollowing: boolean;
  followerCount: number;
};

type RatingRow = {
  user_id: string;
  tenant_id: string;
  games_played?: number | null;
  peak_rating?: number | null;
};

type TeamMemberRow = {
  user_id: string;
  team_id?: string | null;
  // Embed PostgREST « teams(name, slug) » : objet unique (FK team_id -> teams.id)
  // ou null. Toléré en tableau par prudence (mock / variantes de schéma cache).
  teams?:
    | { name?: string | null; slug?: string | null }
    | Array<{ name?: string | null; slug?: string | null }>
    | null;
};

/** Nombre max d'équipes affichées par carte (évite un payload dégénéré). */
export const MAX_TEAMS_PER_CARD = 6;

/**
 * Agrège les lignes player_ratings (une par tenant) par user_id :
 *   games = somme(games_played), peakRating = max(peak_rating),
 *   tenants = nb de tenant_id distincts.
 */
function aggregateRatings(rows: RatingRow[]): Map<string, PlayerStats> {
  const acc = new Map<
    string,
    { games: number; peakRating: number; tenants: Set<string> }
  >();
  for (const r of rows) {
    let entry = acc.get(r.user_id);
    if (!entry) {
      entry = { games: 0, peakRating: 0, tenants: new Set<string>() };
      acc.set(r.user_id, entry);
    }
    entry.games += Number(r.games_played ?? 0);
    entry.peakRating = Math.max(entry.peakRating, Number(r.peak_rating ?? 0));
    if (r.tenant_id) entry.tenants.add(r.tenant_id);
  }
  const out = new Map<string, PlayerStats>();
  for (const [userId, e] of acc) {
    out.set(userId, {
      games: e.games,
      peakRating: e.peakRating,
      tenants: e.tenants.size,
    });
  }
  return out;
}

/** Normalise l'embed teams (objet | tableau | null) en un couple {name, slug}. */
function firstTeam(
  embed: TeamMemberRow['teams']
): { name: string; slug: string | null } | null {
  const t = Array.isArray(embed) ? embed[0] : embed;
  if (!t || typeof t.name !== 'string' || t.name.length === 0) return null;
  return { name: t.name, slug: (t.slug as string | null) ?? null };
}

/**
 * Agrège les équipes par user_id (embed teams(name, slug)) en dédupliquant sur
 * team_id et en cappant à MAX_TEAMS_PER_CARD.
 */
function aggregateTeams(rows: TeamMemberRow[]): Map<string, PlayerTeam[]> {
  const acc = new Map<string, { seen: Set<string>; teams: PlayerTeam[] }>();
  for (const r of rows) {
    const team = firstTeam(r.teams);
    if (!team) continue;
    let entry = acc.get(r.user_id);
    if (!entry) {
      entry = { seen: new Set<string>(), teams: [] };
      acc.set(r.user_id, entry);
    }
    if (entry.teams.length >= MAX_TEAMS_PER_CARD) continue;
    const dedupeKey = String(r.team_id ?? team.slug ?? team.name);
    if (entry.seen.has(dedupeKey)) continue;
    entry.seen.add(dedupeKey);
    entry.teams.push(team);
  }
  const out = new Map<string, PlayerTeam[]>();
  for (const [userId, e] of acc) out.set(userId, e.teams);
  return out;
}

/**
 * Construit les cartes enrichies pour une page de profils découvrables. Émet au
 * plus quatre requêtes bulk (+ discord). Lève en cas d'erreur DB : l'appelant
 * traduit en 500.
 */
export async function buildDirectoryPlayers(
  rows: DiscoveryProfileRow[],
  callerId: string
): Promise<DirectoryPlayer[]> {
  const ids = rows.map((r) => r.auth_user_id);
  if (ids.length === 0) return [];

  // 1. Stats agrégées cross-tenant (une seule requête).
  const { data: ratingRows, error: ratingError } = await supabaseAdmin!
    .from('player_ratings')
    .select('user_id, tenant_id, games_played, peak_rating')
    .in('user_id', ids);
  if (ratingError) {
    logger.error('[playerDiscoveryEnrich] ratings error', ratingError);
    throw new Error('Failed to load player ratings');
  }
  const statsByUser = aggregateRatings(
    (ratingRows as RatingRow[] | null) ?? []
  );

  // 2. Équipes via embed PostgREST teams(name, slug) (une seule requête).
  const { data: memberRows, error: memberError } = await supabaseAdmin!
    .from('team_members')
    .select('user_id, team_id, teams(name, slug)')
    .in('user_id', ids);
  if (memberError) {
    logger.error('[playerDiscoveryEnrich] team_members error', memberError);
    throw new Error('Failed to load team memberships');
  }
  const teamsByUser = aggregateTeams(
    (memberRows as TeamMemberRow[] | null) ?? []
  );

  // 3 + 4. Métadonnées de suivi (followerCount + isFollowing du caller).
  const { data: countRows, error: countError } = await supabaseAdmin!
    .from('player_follows')
    .select('followee_id')
    .in('followee_id', ids);
  if (countError) {
    logger.error('[playerDiscoveryEnrich] follower count error', countError);
    throw new Error('Failed to load follower counts');
  }
  const followerCount = new Map<string, number>();
  for (const r of (countRows as Array<{ followee_id: string }> | null) ?? []) {
    followerCount.set(
      r.followee_id,
      (followerCount.get(r.followee_id) ?? 0) + 1
    );
  }

  const { data: mineRows, error: mineError } = await supabaseAdmin!
    .from('player_follows')
    .select('followee_id')
    .eq('follower_id', callerId)
    .in('followee_id', ids);
  if (mineError) {
    logger.error('[playerDiscoveryEnrich] isFollowing error', mineError);
    throw new Error('Failed to load follow state');
  }
  const followingSet = new Set<string>();
  for (const r of (mineRows as Array<{ followee_id: string }> | null) ?? []) {
    followingSet.add(r.followee_id);
  }

  // Discord (bulk).
  const discordByUser = await getDiscordLinksForUsers(ids);

  return rows.map((row) => {
    const discordUsername =
      discordByUser.get(row.auth_user_id)?.discordUsername ?? null;
    const player: DirectoryPlayer = {
      authUserId: row.auth_user_id,
      displayName: row.display_name ?? discordUsername ?? 'Joueur',
      avatarUrl: row.avatar_url ?? null,
      tagline: row.tagline ?? null,
      discordUsername,
      isFollowing: followingSet.has(row.auth_user_id),
      followerCount: followerCount.get(row.auth_user_id) ?? 0,
    };
    // Respect du flag show_ratings (défaut true) : stats omises si false.
    if (row.show_ratings !== false) {
      const stats = statsByUser.get(row.auth_user_id);
      if (stats) player.stats = stats;
    }
    // Respect du flag show_teams (défaut true) : teams omises si false.
    if (row.show_teams !== false) {
      const teams = teamsByUser.get(row.auth_user_id);
      if (teams && teams.length > 0) player.teams = teams;
    }
    return player;
  });
}
