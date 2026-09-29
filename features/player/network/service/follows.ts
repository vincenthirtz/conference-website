// features/player/network/service/follows.ts — suivi joueuse cross-tenant
// (lot P15).
//
// RÈGLE PRODUIT (kill-switch fort) : on ne suit QU'UNE joueuse DÉCOUVRABLE,
// et les listes ne rendent QUE des joueuses actuellement découvrables. Un
// opt-out la fait disparaître des listes de tout le monde sans supprimer
// l'arête (elle réapparaît si elle redevient découvrable).

import { LegacyAdminError } from '@/utils/admin/errors';
import { buildDirectoryPlayers } from '@/utils/playerDiscoveryEnrich';
import * as repo from '../repository';
import {
  FollowBody,
  FollowsListQuery,
  type FollowResult,
  type FollowsListResponse,
} from '../schemas';
import {
  notDiscoverable,
  parseOrThrow,
  serverError,
  type NetworkCtx,
} from './context';

/** POST /api/player/follows — suivre une joueuse découvrable (idempotent). */
export async function follow(
  ctx: NetworkCtx,
  rawBody: unknown
): Promise<FollowResult> {
  const { followeeId } = parseOrThrow(FollowBody, rawBody, 'INVALID_BODY');
  if (followeeId === ctx.userId) {
    throw new LegacyAdminError(400, 'On ne peut pas se suivre soi-même.', {
      code: 'CANNOT_FOLLOW_SELF',
    });
  }

  const target = await repo.readDiscoverableTarget(ctx.db, followeeId);
  if (target.error) {
    ctx.logger.error('[player/follows] POST target lookup error', target.error);
    throw serverError();
  }
  if (!target.exists) throw notDiscoverable();

  const { error } = await repo.insertFollow(ctx.db, ctx.userId, followeeId);
  if (error) {
    ctx.logger.error('[player/follows] POST upsert error', error);
    throw serverError();
  }
  return { following: true };
}

/** DELETE /api/player/follows — ne plus suivre (idempotent). */
export async function unfollow(
  ctx: NetworkCtx,
  rawBody: unknown
): Promise<FollowResult> {
  const { followeeId } = parseOrThrow(FollowBody, rawBody, 'INVALID_BODY');
  const { error } = await repo.deleteFollow(ctx.db, ctx.userId, followeeId);
  if (error) {
    ctx.logger.error('[player/follows] DELETE error', error);
    throw serverError();
  }
  return { following: false };
}

/** GET /api/player/follows — qui je suis (`following`) / qui me suit. */
export async function listFollows(
  ctx: NetworkCtx,
  rawQuery: unknown
): Promise<FollowsListResponse> {
  const { type, limit, offset } = parseOrThrow(
    FollowsListQuery,
    rawQuery ?? {},
    'INVALID_QUERY'
  );

  const edges = await repo.listFollowCounterparts(ctx.db, ctx.userId, type);
  if (edges.error) {
    ctx.logger.error('[player/follows] GET edges error', edges.error);
    throw serverError();
  }
  if (edges.ids.length === 0) {
    return { players: [], total: 0, limit, offset, type };
  }

  const profiles = await repo.listDiscoverableIn(ctx.db, edges.ids);
  if (profiles.error) {
    ctx.logger.error('[player/follows] GET profiles error', profiles.error);
    throw serverError();
  }
  const total = profiles.rows.length;
  const pageRows = profiles.rows.slice(offset, offset + limit);

  let players;
  try {
    players = await buildDirectoryPlayers(pageRows, ctx.userId);
  } catch (e) {
    ctx.logger.error('[player/follows] GET enrich error', e);
    throw serverError();
  }
  return { players, total, limit, offset, type };
}
