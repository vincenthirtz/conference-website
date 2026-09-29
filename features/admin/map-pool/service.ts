// features/admin/map-pool/service.ts — catalogue de maps **tenant-level**
// éditable (`tenant_map_pool`). Source du flux par-tournoi
// (pages/api/tournament/[id]/maps.ts), qui retombe sur le catalogue statique
// config/games UNIQUEMENT si le pool tenant est vide.
//
// Contrat HTTP historique conservé : messages en anglais, codes métier
// `INVALID_BODY` (+ `fields`), `INVALID_GAME`, `INVALID_MAP_ID`,
// `UNKNOWN_MAP`, `DUPLICATE_MAP`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { firstParam } from '@/utils/admin/pathParams';
import { GAME_SLUGS, getGame, isGameSlug, type GameSlug } from '@/config/games';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import {
  MapPoolCreateBody,
  MapPoolImportBody,
  MapPoolPatchBody,
} from './schemas';

export type MapPoolRow = Awaited<
  ReturnType<typeof repo.listMaps>
>['rows'][number];

/** Tri stable : order_index NULLS LAST, puis map_name (insensible casse). */
export function sortMapPool<
  T extends Pick<MapPoolRow, 'order_index' | 'map_name'>,
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ai = a.order_index;
    const bi = b.order_index;
    if (ai == null && bi != null) return 1;
    if (ai != null && bi == null) return -1;
    if (ai != null && bi != null && ai !== bi) return ai - bi;
    return a.map_name.localeCompare(b.map_name);
  });
}

const serverError = () => new AdminError(500, 'internal', 'Server error.');
const invalidGame = () =>
  new LegacyAdminError(400, 'Invalid game slug.', { code: 'INVALID_GAME' });

function invalidBody(fields?: unknown): LegacyAdminError {
  return new LegacyAdminError(400, 'Invalid body.', {
    code: 'INVALID_BODY',
    ...(fields ? { extra: { fields } } : {}),
  });
}

function readMapId(raw: unknown): string {
  const value = firstParam(raw);
  if (typeof value !== 'string' || !isValidUUID(value)) {
    throw new LegacyAdminError(400, 'Invalid map id.', {
      code: 'INVALID_MAP_ID',
    });
  }
  return value;
}

/* ---------------------------------------------------------------------------
 * GET — groupé par jeu, ou liste plate avec `?game=`
 * ------------------------------------------------------------------------ */

export async function listMapPool(
  ctx: ServiceContext,
  rawGame: unknown
): Promise<
  | { game: GameSlug; maps: MapPoolRow[] }
  | { pools: Record<GameSlug, MapPoolRow[]> }
> {
  const gameParam = firstParam(rawGame);

  if (typeof gameParam === 'string' && gameParam.length > 0) {
    if (!isGameSlug(gameParam)) throw invalidGame();
    const { rows, error } = await repo.listMaps(
      ctx.db,
      ctx.tenantId,
      gameParam
    );
    if (error) {
      ctx.logger.error('[admin/map-pool] list by game error', error, {
        tenantId: ctx.tenantId,
      });
      throw serverError();
    }
    return { game: gameParam, maps: sortMapPool(rows) };
  }

  const { rows, error } = await repo.listMaps(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/map-pool] list all error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }

  const pools: Record<string, MapPoolRow[]> = {};
  for (const slug of GAME_SLUGS) pools[slug] = [];
  for (const row of rows) (pools[row.game] ||= []).push(row);
  for (const slug of Object.keys(pools)) pools[slug] = sortMapPool(pools[slug]);

  return { pools: pools as Record<GameSlug, MapPoolRow[]> };
}

/* ---------------------------------------------------------------------------
 * POST — créer une map (409 si doublon insensible à la casse)
 * ------------------------------------------------------------------------ */

export async function createMapPoolEntry(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ map: MapPoolRow }>> {
  const parsed = MapPoolCreateBody.safeParse(rawBody);
  if (!parsed.success) throw invalidBody(parsed.error.flatten().fieldErrors);

  const { game } = parsed.data;
  if (!isGameSlug(game)) throw invalidGame();
  const mapName = parsed.data.map_name;

  // Dédup insensible à la casse (tenant, game, lower(map_name)). L'index unique
  // DB garantit l'unicité ; on pré-vérifie ici pour renvoyer un 409 propre
  // (le mock de test ne lève pas la contrainte unique).
  const existing = await repo.listMapNames(ctx.db, ctx.tenantId, game);
  if (existing.error) {
    ctx.logger.error('[admin/map-pool] dedup lookup error', existing.error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  const wanted = mapName.toLowerCase();
  if (existing.rows.some((r) => (r.map_name ?? '').toLowerCase() === wanted)) {
    throw new LegacyAdminError(
      409,
      'A map with this name already exists for this game.',
      { code: 'DUPLICATE_MAP' }
    );
  }

  // order_index par défaut : à la suite de l'existant.
  let orderIndex: number | null;
  if (typeof parsed.data.order_index === 'number') {
    orderIndex = parsed.data.order_index;
  } else if (parsed.data.order_index === null) {
    orderIndex = null;
  } else {
    orderIndex =
      existing.rows.reduce((acc, r) => Math.max(acc, r.order_index ?? -1), -1) +
      1;
  }

  const { row, error } = await repo.insertMap(ctx.db, {
    tenant_id: ctx.tenantId,
    game,
    map_name: mapName,
    map_type: parsed.data.map_type ?? null,
    image_url: parsed.data.image_url ?? null,
    enabled: parsed.data.enabled ?? true,
    order_index: orderIndex,
    updated_at: new Date().toISOString(),
  });
  if (error || !row) {
    ctx.logger.error('[admin/map-pool] insert error', error, {
      tenantId: ctx.tenantId,
    });
    throw new AdminError(500, 'internal', 'Failed to create map.');
  }

  return {
    result: { map: row },
    audit: {
      entity_type: 'map_pool',
      entity_id: row.id,
      payload: { action: 'create_map_pool_entry', game, map_name: mapName },
    },
  };
}

/* ---------------------------------------------------------------------------
 * PATCH / DELETE /api/admin/map-pool/[mapId]
 * ------------------------------------------------------------------------ */

export async function updateMapPoolEntry(
  ctx: ServiceContext,
  rawMapId: unknown,
  rawBody: unknown
): Promise<Audited<{ map: MapPoolRow }>> {
  const mapId = readMapId(rawMapId);
  const parsed = MapPoolPatchBody.safeParse(rawBody);
  if (!parsed.success) throw invalidBody(parsed.error.flatten().fieldErrors);

  // Scope tenant strict : la ligne doit appartenir au tenant actif.
  const found = await repo.findMap(ctx.db, ctx.tenantId, mapId);
  if (found.error) {
    ctx.logger.error('[admin/map-pool] patch lookup error', found.error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (!found.row) {
    throw new LegacyAdminError(404, 'Map not found.', { code: 'UNKNOWN_MAP' });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const d = parsed.data;
  if (d.map_name !== undefined) update.map_name = d.map_name;
  if (d.map_type !== undefined) update.map_type = d.map_type ?? null;
  if (d.image_url !== undefined) update.image_url = d.image_url ?? null;
  if (d.enabled !== undefined) update.enabled = d.enabled;
  if (d.order_index !== undefined) update.order_index = d.order_index ?? null;

  const { row, error } = await repo.updateMap(
    ctx.db,
    ctx.tenantId,
    mapId,
    update
  );
  if (error || !row) {
    ctx.logger.error('[admin/map-pool] patch update error', error, {
      tenantId: ctx.tenantId,
    });
    throw new AdminError(500, 'internal', 'Failed to update map.');
  }

  return {
    result: { map: row },
    audit: {
      entity_type: 'map_pool',
      entity_id: mapId,
      payload: {
        action: 'update_map_pool_entry',
        fields: Object.keys(update).filter((k) => k !== 'updated_at'),
      },
    },
  };
}

export async function deleteMapPoolEntry(
  ctx: ServiceContext,
  rawMapId: unknown
): Promise<Audited<{ ok: true }>> {
  const mapId = readMapId(rawMapId);

  const found = await repo.findMap(ctx.db, ctx.tenantId, mapId);
  if (found.error) {
    ctx.logger.error('[admin/map-pool] delete lookup error', found.error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (!found.row) {
    throw new LegacyAdminError(404, 'Map not found.', { code: 'UNKNOWN_MAP' });
  }

  const { error } = await repo.deleteMap(ctx.db, ctx.tenantId, mapId);
  if (error) {
    ctx.logger.error('[admin/map-pool] delete error', error, {
      tenantId: ctx.tenantId,
    });
    throw new AdminError(500, 'internal', 'Failed to delete map.');
  }

  return {
    result: { ok: true },
    audit: {
      entity_type: 'map_pool',
      entity_id: mapId,
      payload: {
        action: 'delete_map_pool_entry',
        game: found.row.game ?? null,
        map_name: found.row.map_name ?? null,
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * POST /api/admin/map-pool/import-defaults — seed depuis config/games
 * ------------------------------------------------------------------------ */

export async function importDefaultMaps(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<{ imported: number; skipped: number; maps: MapPoolRow[] }>> {
  const parsed = MapPoolImportBody.safeParse(rawBody);
  if (!parsed.success) throw invalidBody();

  const { game } = parsed.data;
  if (!isGameSlug(game)) throw invalidGame();

  const defaults = getGame(game)?.mapPool ?? [];

  // État courant du pool tenant (pour dédup + prochain order_index).
  const existing = await repo.listMapNames(ctx.db, ctx.tenantId, game);
  if (existing.error) {
    ctx.logger.error(
      '[admin/map-pool] import-defaults lookup error',
      existing.error,
      { tenantId: ctx.tenantId }
    );
    throw serverError();
  }

  const present = new Set(
    existing.rows.map((r) => (r.map_name ?? '').toLowerCase())
  );
  let nextIndex =
    existing.rows.reduce((acc, r) => Math.max(acc, r.order_index ?? -1), -1) +
    1;

  const now = new Date().toISOString();
  const toInsert = defaults
    .filter((m) => !present.has(m.name.toLowerCase()))
    .map((m) => ({
      tenant_id: ctx.tenantId,
      game,
      map_name: m.name,
      map_type: m.type ?? null,
      image_url: m.image ?? null,
      enabled: true,
      order_index: nextIndex++,
      updated_at: now,
    }));

  const skipped = defaults.length - toInsert.length;

  if (toInsert.length === 0) {
    // Rien à insérer : renvoyer l'état courant complet du jeu, sans journal.
    const current = await repo.listMaps(ctx.db, ctx.tenantId, game);
    return {
      result: { imported: 0, skipped, maps: sortMapPool(current.rows) },
      audit: { skip: true },
    };
  }

  const inserted = await repo.insertMaps(ctx.db, toInsert);
  if (inserted.error) {
    ctx.logger.error(
      '[admin/map-pool] import-defaults insert error',
      inserted.error,
      { tenantId: ctx.tenantId }
    );
    throw new AdminError(500, 'internal', 'Failed to import default maps.');
  }

  // Renvoyer l'état complet du jeu après import (existant + nouveau).
  const full = await repo.listMaps(ctx.db, ctx.tenantId, game);
  return {
    result: {
      imported: inserted.rows.length,
      skipped,
      maps: sortMapPool(full.rows),
    },
    audit: {
      entity_type: 'map_pool',
      entity_id: null,
      payload: {
        action: 'import_default_maps',
        game,
        imported: inserted.rows.length,
        skipped,
      },
    },
  };
}
