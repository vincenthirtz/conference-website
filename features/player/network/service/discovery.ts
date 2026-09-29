// features/player/network/service/discovery.ts — carte de découverte de la
// joueuse, annuaire du réseau et fiche sociale d'une joueuse (lot P15).
//
// Convention « absent = défaut » (cf. notification_prefs) : sans ligne, une
// joueuse est NON découvrable (discoverable=false) et expose les défauts de
// visibilité (showRatings=true, showTeams=true).
//
// `opted_in_at` (audit RGPD) : posé au PREMIER passage discoverable=true,
// JAMAIS effacé. Le « kill-switch » (repasser à false) garde la ligne et
// l'horodatage du consentement.
//
// L'enrichissement SANS N+1 (stats si show_ratings, équipes si show_teams,
// Discord, isFollowing / followerCount) reste celui de
// utils/playerDiscoveryEnrich, partagé avec les listes de suivi.

import type { TablesInsert } from '@/types/database.generated';
import { LegacyAdminError } from '@/utils/admin/errors';
import { buildDirectoryPlayers } from '@/utils/playerDiscoveryEnrich';
import * as repo from '../repository';
import type { DiscoveryRow } from '../repository';
import {
  DiscoveryProfileQuery,
  DiscoveryPutBody,
  DiscoverySearchQuery,
  type DiscoveryCard,
  type DiscoveryProfileState,
  type DiscoverySearchResponse,
} from '../schemas';
import { parseOrThrow, serverError, type NetworkCtx } from './context';

/** Projette une ligne (ou son absence) sur la carte, défauts « invisible ». */
export function toDiscoveryCard(row: DiscoveryRow | null): DiscoveryCard {
  return {
    discoverable: row?.discoverable ?? false,
    displayName: row?.display_name ?? null,
    avatarUrl: row?.avatar_url ?? null,
    tagline: row?.tagline ?? null,
    showRatings: row?.show_ratings ?? true,
    showTeams: row?.show_teams ?? true,
    optedInAt: row?.opted_in_at ?? null,
  };
}

async function loadRow(ctx: NetworkCtx): Promise<DiscoveryRow | null> {
  const { row, error } = await repo.readDiscoveryRow(ctx.db, ctx.userId);
  if (error) {
    ctx.logger.error('[player/discovery] load error', error);
    throw serverError();
  }
  return row;
}

/** GET /api/player/discovery — ma carte. */
export async function getMyDiscoveryCard(
  ctx: NetworkCtx
): Promise<DiscoveryCard> {
  return toDiscoveryCard(await loadRow(ctx));
}

/** PUT /api/player/discovery — patch partiel, puis relecture. */
export async function updateMyDiscoveryCard(
  ctx: NetworkCtx,
  rawBody: unknown
): Promise<DiscoveryCard> {
  const patch = parseOrThrow(DiscoveryPutBody, rawBody, 'INVALID_BODY');
  const existing = await loadRow(ctx);

  const resultingDiscoverable =
    patch.discoverable !== undefined
      ? patch.discoverable
      : (existing?.discoverable ?? false);
  const shouldSetOptedIn =
    resultingDiscoverable === true && !existing?.opted_in_at;

  const payload: TablesInsert<'player_discovery_profiles'> = {
    auth_user_id: ctx.userId,
    updated_at: new Date().toISOString(),
  };
  if (patch.discoverable !== undefined)
    payload.discoverable = patch.discoverable;
  if (patch.displayName !== undefined) payload.display_name = patch.displayName;
  if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;
  if (patch.tagline !== undefined) payload.tagline = patch.tagline;
  if (patch.showRatings !== undefined) payload.show_ratings = patch.showRatings;
  if (patch.showTeams !== undefined) payload.show_teams = patch.showTeams;
  if (shouldSetOptedIn) payload.opted_in_at = new Date().toISOString();

  const { error } = await repo.upsertDiscoveryRow(ctx.db, payload);
  if (error) {
    ctx.logger.error('[player/discovery] PUT upsert error', error);
    throw serverError();
  }
  return toDiscoveryCard(await loadRow(ctx));
}

/**
 * GET /api/player/discovery/search — annuaire des joueuses DÉCOUVRABLES.
 * L'appelante ne s'y liste jamais (on ne se suit pas soi-même).
 */
export async function searchDirectory(
  ctx: NetworkCtx,
  rawQuery: unknown
): Promise<DiscoverySearchResponse> {
  const parsed = parseOrThrow(
    DiscoverySearchQuery,
    rawQuery ?? {},
    'INVALID_QUERY'
  );
  const { limit, offset } = parsed;
  const q = parsed.q && parsed.q.length > 0 ? parsed.q : undefined;

  const { rows, count, error } = await repo.searchDiscoverable(ctx.db, {
    callerId: ctx.userId,
    q,
    limit,
    offset,
  });
  if (error) {
    ctx.logger.error('[player/discovery/search] query error', error);
    throw serverError();
  }

  let players;
  try {
    players = await buildDirectoryPlayers(rows, ctx.userId);
  } catch (e) {
    ctx.logger.error('[player/discovery/search] enrich error', e);
    throw serverError();
  }
  return { players, total: count ?? players.length, limit, offset };
}

/** Réponse unique du cas « rien à montrer », quelle qu'en soit la raison. */
const HIDDEN: DiscoveryProfileState = { discoverable: false };

/**
 * GET /api/player/discovery/profile — « cette joueuse-là, je peux la suivre,
 * et la suis-je déjà ? ». ANTI-ÉNUMÉRATION : id malformé, compte inexistant
 * et joueuse invisible rendent TOUS `{ discoverable: false }` en 200.
 */
export async function readSocialProfile(
  ctx: NetworkCtx,
  rawQuery: unknown
): Promise<DiscoveryProfileState> {
  const parsed = DiscoveryProfileQuery.safeParse(rawQuery ?? {});
  if (!parsed.success) return HIDDEN;

  const { row, error } = await repo.readDiscoverableProfile(
    ctx.db,
    parsed.data.userId
  );
  if (error) {
    ctx.logger.error('[player/discovery/profile] read error', error);
    throw new LegacyAdminError(500, 'Lecture impossible.');
  }
  if (!row) return HIDDEN;

  const [player] = await buildDirectoryPlayers([row], ctx.userId);
  if (!player) return HIDDEN;
  return {
    discoverable: true,
    isFollowing: player.isFollowing,
    followerCount: player.followerCount,
    teams: player.teams ?? [],
  };
}
