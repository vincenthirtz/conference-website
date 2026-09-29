// features/admin/recycle-bin/service.ts — corbeille : liste paginée des
// éléments soft-deleted (toutes sources) et restauration.
//
// PAGINATION. Un type → la source est paginée seule (count exact). Tous
// types → counts en parallèle + tranche BORNÉE `[0, offset+limit)` par source,
// fusion, tri `deleted_at` desc, slice : mémoire O(nbSources × (offset+limit)).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import {
  DELETED_TYPES,
  PLATFORM_DELETED_TYPES,
  type DeletedType,
} from './schemas';

/**
 * Ce que l'appelant peut toucher : `platform` = pôle-admin ou owner GLOBAL
 * (`isPlatformOwner`). Sans lui, les sources globales (`partners`,
 * `adherents`, `staff`) sont hors périmètre : un owner d'espace restaurait
 * un compte staff ou un adhérent de toute la plateforme.
 */
export type RecycleBinCaller = { platform: boolean };

function assertTypeInScope(caller: RecycleBinCaller, type: DeletedType): void {
  if (!caller.platform && PLATFORM_DELETED_TYPES.includes(type)) {
    throw new LegacyAdminError(403, 'Forbidden.', { code: 'PLATFORM_SCOPE' });
  }
}

function deletedAtTime(item: repo.DeletedItem): number {
  return item.deleted_at ? new Date(item.deleted_at).getTime() : 0;
}

export async function listRecycleBin(
  ctx: ServiceContext,
  caller: RecycleBinCaller,
  q: Record<string, unknown>,
  page: { limit: number; offset: number }
): Promise<{ items: repo.DeletedItem[]; total: number }> {
  const rawType = q.type;
  const typeFilter = (Array.isArray(rawType) ? rawType[0] : rawType) as
    | DeletedType
    | undefined;
  const { limit, offset } = page;

  if (typeFilter) {
    if (!DELETED_TYPES.includes(typeFilter)) {
      throw new LegacyAdminError(400, `Unknown type: ${typeFilter}`);
    }
    assertTypeInScope(caller, typeFilter);
    try {
      const { count, error } = await repo.countDeleted(
        ctx.db,
        ctx.tenantId,
        typeFilter
      );
      if (error) throw error;
      // Tranche bornée (offset+limit) déjà triée, puis slice.
      const rows = await repo.fetchDeletedSlice(
        ctx.db,
        ctx.tenantId,
        typeFilter,
        offset + limit
      );
      const slice = rows.slice(offset, offset + limit);
      return {
        items: slice,
        total: typeof count === 'number' ? count : slice.length,
      };
    } catch (err) {
      ctx.logger.error('[/api/admin/recycle-bin] GET single-type error:', err);
      throw new LegacyAdminError(500, 'Failed to fetch recycle bin');
    }
  }

  const types = DELETED_TYPES.filter(
    (t) => caller.platform || !PLATFORM_DELETED_TYPES.includes(t)
  );
  try {
    const bounded = offset + limit;
    const [counts, slices] = await Promise.all([
      Promise.all(
        types.map((t) =>
          Promise.resolve(repo.countDeleted(ctx.db, ctx.tenantId, t)).then(
            (r) => {
              if (r.error) throw r.error;
              return typeof r.count === 'number' ? r.count : 0;
            }
          )
        )
      ),
      Promise.all(
        types.map((t) =>
          repo.fetchDeletedSlice(ctx.db, ctx.tenantId, t, bounded)
        )
      ),
    ]);
    const merged = slices.flat();
    merged.sort((a, b) => deletedAtTime(b) - deletedAtTime(a));
    return {
      items: merged.slice(offset, offset + limit),
      total: counts.reduce((acc, n) => acc + n, 0),
    };
  } catch (err) {
    ctx.logger.error('[/api/admin/recycle-bin] GET all-types error:', err);
    throw new LegacyAdminError(500, 'Failed to fetch recycle bin');
  }
}

export async function restoreFromRecycleBin(
  ctx: ServiceContext,
  caller: RecycleBinCaller,
  body: Record<string, unknown>
): Promise<Audited<{ restored: true; type: string; id: string }>> {
  const { id, type } = body as { id?: string; type?: string };
  if (!id || !type) {
    throw new LegacyAdminError(400, 'id and type are required');
  }
  if (!(DELETED_TYPES as readonly string[]).includes(type)) {
    throw new LegacyAdminError(400, `Unknown type: ${type}`);
  }
  // Avant toute écriture.
  assertTypeInScope(caller, type as DeletedType);

  const nowIso = new Date().toISOString();
  let error: unknown;
  try {
    ({ error } = await repo.restoreDeleted(
      ctx.db,
      ctx.tenantId,
      type as DeletedType,
      id,
      nowIso
    ));
  } catch (err) {
    error = err;
  }
  if (error) {
    ctx.logger.error('[/api/admin/recycle-bin] restore error:', error);
    // Jamais le message brut de la base (schéma, contraintes) dans la réponse.
    throw new LegacyAdminError(500, 'Failed to restore item');
  }

  return {
    result: { restored: true, type, id },
    audit: {
      entity_type: type,
      entity_id: id,
      payload: { action_label: 'restore_item', type, restored_at: nowIso },
    },
  };
}
