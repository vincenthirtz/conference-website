// features/player/network/repository.ts — accès base du réseau de la joueuse
// (lot P15). Colonnes explicites ; la base est REÇUE.
//
// `player_discovery_profiles` et `player_follows` sont RLS service-role only
// (aucune policy) : tout passe par le client serveur, scopé à la main sur
// l'appelante. Ces tables sont GLOBALES (cross-tenant, pas de `tenant_id`) :
// c'est le réseau de découverte. Le dossier d'adversaire, lui, est scopé au
// tenant de la joueuse.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert } from '@/types/database.generated';
import type { DiscoveryProfileRow } from '@/utils/playerDiscoveryEnrich';

/* ------------------------------------------------------------------ *
 * player_discovery_profiles
 * ------------------------------------------------------------------ */

/** Ligne brute de la carte de la joueuse. */
export type DiscoveryRow = {
  auth_user_id: string;
  discoverable?: boolean | null;
  display_name?: string | null;
  avatar_url?: string | null;
  tagline?: string | null;
  show_ratings?: boolean | null;
  show_teams?: boolean | null;
  opted_in_at?: string | null;
};

const CARD_COLS =
  'auth_user_id, discoverable, display_name, avatar_url, tagline, show_ratings, show_teams, opted_in_at';

/** Colonnes d'une carte d'annuaire (jamais `opted_in_at`, audit RGPD). */
const PROFILE_COLS =
  'auth_user_id, display_name, avatar_url, tagline, show_ratings, show_teams';

export async function readDiscoveryRow(db: AdminDb, authUserId: string) {
  const { data, error } = await db
    .from('player_discovery_profiles')
    .select(CARD_COLS)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return { row: (data as DiscoveryRow | null) ?? null, error };
}

/** Upsert réel sur la PK mono-colonne `auth_user_id`. */
export async function upsertDiscoveryRow(
  db: AdminDb,
  payload: TablesInsert<'player_discovery_profiles'>
) {
  const { error } = await db
    .from('player_discovery_profiles')
    .upsert(payload, { onConflict: 'auth_user_id' });
  return { error };
}

/** Page de l'annuaire (découvrables seulement, l'appelante exclue) + total. */
export async function searchDiscoverable(
  db: AdminDb,
  args: { callerId: string; q?: string; limit: number; offset: number }
) {
  let query = db
    .from('player_discovery_profiles')
    .select(PROFILE_COLS, { count: 'exact' })
    .eq('discoverable', true)
    .neq('auth_user_id', args.callerId);
  if (args.q) query = query.ilike('display_name', `%${args.q}%`);
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(args.offset, args.offset + args.limit - 1);
  return {
    rows: (data as DiscoveryProfileRow[] | null) ?? [],
    count: count as number | null,
    error,
  };
}

/** Carte d'une joueuse SI elle est découvrable (sinon `null`). */
export async function readDiscoverableProfile(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('player_discovery_profiles')
    .select(PROFILE_COLS)
    .eq('auth_user_id', userId)
    .eq('discoverable', true)
    .maybeSingle();
  return { row: (data as DiscoveryProfileRow | null) ?? null, error };
}

/** Existe ET découvrable ? (suivi : 404 uniforme sinon, anti-énumération). */
export async function readDiscoverableTarget(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('player_discovery_profiles')
    .select('auth_user_id')
    .eq('auth_user_id', userId)
    .eq('discoverable', true)
    .maybeSingle();
  return { exists: Boolean(data), error };
}

/** Drapeau `discoverable` d'une joueuse (« absent = non découvrable »). */
export async function readDiscoverableFlag(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('player_discovery_profiles')
    .select('auth_user_id, discoverable')
    .eq('auth_user_id', userId)
    .maybeSingle();
  return {
    discoverable:
      (data as { discoverable?: boolean | null } | null)?.discoverable === true,
    error,
  };
}

/** Cartes découvrables parmi `ids`, plus récentes d'abord. */
export async function listDiscoverableIn(db: AdminDb, ids: string[]) {
  const { data, error } = await db
    .from('player_discovery_profiles')
    .select(PROFILE_COLS)
    .in('auth_user_id', ids)
    .eq('discoverable', true)
    .order('updated_at', { ascending: false });
  return { rows: (data as DiscoveryProfileRow[] | null) ?? [], error };
}

/* ------------------------------------------------------------------ *
 * player_follows
 * ------------------------------------------------------------------ */

/** Insert idempotent : `(follower_id, followee_id)` ignore les doublons. */
export async function insertFollow(
  db: AdminDb,
  followerId: string,
  followeeId: string
) {
  const { error } = await db.from('player_follows').upsert(
    {
      follower_id: followerId,
      followee_id: followeeId,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'follower_id,followee_id', ignoreDuplicates: true }
  );
  return { error };
}

/** Delete idempotent, toujours scopé sur l'appelante. */
export async function deleteFollow(
  db: AdminDb,
  followerId: string,
  followeeId: string
) {
  const { error } = await db
    .from('player_follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  return { error };
}

/**
 * Identifiants de l'autre bout des arêtes de l'appelante : ceux qu'elle suit
 * (`following`) ou ceux qui la suivent (`followers`).
 */
export async function listFollowCounterparts(
  db: AdminDb,
  callerId: string,
  type: 'following' | 'followers'
) {
  const edgeCol = type === 'following' ? 'follower_id' : 'followee_id';
  const otherCol = type === 'following' ? 'followee_id' : 'follower_id';
  const { data, error } = await db
    .from('player_follows')
    .select(`${edgeCol}, ${otherCol}`)
    .eq(edgeCol, callerId);
  const ids = Array.from(
    new Set(
      ((data as Array<Record<string, string>> | null) ?? [])
        .map((e) => e[otherCol])
        .filter((id): id is string => Boolean(id))
    )
  );
  return { ids, error };
}

/* ------------------------------------------------------------------ *
 * Face-à-face (cross-tenant, par construction)
 * ------------------------------------------------------------------ */

export type ParticipantRow = {
  match_id: string;
  team_id: string;
  user_id: string;
  is_substitute: boolean | null;
};

export type H2hMatchRow = {
  id: string;
  tenant_id: string | null;
  tournament_id: string | null;
  winner_team_id: string | null;
  completed_at: string | null;
};

/** Participations d'une joueuse sur TOUS les tenants. */
export async function listParticipations(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('match_participants')
    .select('match_id, team_id, user_id, is_substitute')
    .eq('user_id', userId);
  return { rows: (data as ParticipantRow[] | null) ?? [], error };
}

export async function listMatchesIn(db: AdminDb, ids: string[]) {
  const { data, error } = await db
    .from('matches')
    .select('id, tenant_id, tournament_id, winner_team_id, completed_at')
    .in('id', ids);
  return { rows: (data as H2hMatchRow[] | null) ?? [], error };
}

/* ------------------------------------------------------------------ *
 * Dossier d'adversaire (scopé tenant)
 * ------------------------------------------------------------------ */

export type ScoutTargetRow = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  country: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

export async function readScoutTarget(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select(
      'id, name, short_name, logo_url, slug, country, is_active, deleted_at'
    )
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: (data as ScoutTargetRow | null) ?? null, error };
}

export async function readTeamRating(
  db: AdminDb,
  tenantId: string,
  teamId: string
): Promise<number | null> {
  const { data } = await db
    .from('team_ratings')
    .select('rating')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .maybeSingle();
  const rating = (data as { rating?: number } | null)?.rating;
  return typeof rating === 'number' ? rating : null;
}

/**
 * MES revues sur un adversaire, scopées à MON équipe : la requête ne peut pas
 * remonter celles d'autrui, même par accident.
 */
export async function listMyReviewsOn(
  db: AdminDb,
  args: { tenantId: string; myTeamId: string; opponentTeamId: string }
) {
  const { data } = await db
    .from('team_reviews')
    .select('subject_type, subject_id, played_at, vod_url, notes')
    .eq('tenant_id', args.tenantId)
    .eq('team_id', args.myTeamId)
    .eq('opponent_team_id', args.opponentTeamId)
    .order('played_at', { ascending: false });
  return (data || []) as Array<Record<string, unknown>>;
}

export async function listTeamNames(db: AdminDb, ids: string[]) {
  const { data } = await db.from('teams').select('id, name').in('id', ids);
  return (data || []) as Array<{ id: string; name: string }>;
}
