// features/admin/cast-members/service.ts — fiches cast de l'espace : liste
// (filtres, tri allowlist), création, édition, suppression, liaison à un
// compte staff `caster`, et casters disponibles pour un créneau.
//
// La page publique /association est régénérée par la route
// (`res.revalidate`) après chaque écriture.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import {
  escapePostgrestValue,
  isValidUUID,
  sanitizeSearch,
  sanitizeUrl,
} from '@/utils/apiHelpers';
import type { Database } from '@/types/database.generated';
import * as repo from './repository';
import type { AvailableCaster, CastMemberPayload } from './schemas';

type QueryValue = string | string[] | undefined;
type Query = Record<string, QueryValue>;
type CastMemberUpdate = Database['public']['Tables']['cast_members']['Update'];

const first = (v: QueryValue) => (Array.isArray(v) ? v[0] : v);

// Allowlist de tri (clé exposée → colonne DB).
const SORT_COLUMNS: Record<string, string> = {
  sort_order: 'sort_order',
  name: 'name',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

/**
 * Traduit les refus de la base en messages lisibles : le trigger exige un
 * compte staff `caster`, l'index unique interdit deux fiches pour un compte.
 */
function writeError(
  error: { message?: string; code?: string },
  fallback: string
): AdminError {
  if (/role=caster/i.test(error.message || '')) {
    return new ValidationError(
      'Le compte selectionne doit avoir le role staff "caster".'
    );
  }
  if (error.code === '23505') {
    return new ConflictError(
      'Ce compte caster est deja lie a une autre fiche.'
    );
  }
  return new AdminError(500, 'internal', fallback);
}

export async function listCastMembers(
  ctx: ServiceContext,
  page: { limit: number; offset: number },
  query: Query
) {
  const search = sanitizeSearch(query.search);
  const includeInactive = query.includeInactive === 'true';

  // Statut explicite 'active' | 'inactive' ; sinon compat includeInactive.
  const status = first(query.status);
  const isActive =
    status === 'active'
      ? true
      : status === 'inactive'
        ? false
        : includeInactive
          ? undefined
          : true;

  // Tri serveur via allowlist ; défaut historique = sort_order ASC, autres DESC.
  const orderColumn = SORT_COLUMNS[first(query.orderBy) ?? ''] ?? 'sort_order';
  const orderDir = first(query.orderDir);
  const ascending =
    orderDir === 'desc'
      ? false
      : orderDir === 'asc'
        ? true
        : orderColumn === 'sort_order';

  const { rows, count, error } = await repo.listCastMembers(
    ctx.db,
    ctx.tenantId,
    {
      ...page,
      withTotal: query.includeTotal === '1' || query.includeTotal === 'true',
      isActive,
      searchPattern: search ? `%${escapePostgrestValue(search)}%` : undefined,
      orderColumn,
      ascending,
    }
  );
  if (error) {
    ctx.logger.error('[admin/cast-members] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load cast members.');
  }
  return { items: rows, total: typeof count === 'number' ? count : null };
}

export async function createCastMember(ctx: ServiceContext, raw: unknown) {
  // `req.body` absent faisait lever la lecture des champs → 500 : conservé.
  const body = raw as CastMemberPayload;
  if (!body.name) {
    throw new ValidationError('Name is required.');
  }

  const nextOrder = (await repo.maxSortOrder(ctx.db, ctx.tenantId)) + 1;

  let authUserId: string | null = null;
  if ('authUserId' in body && body.authUserId) {
    if (typeof body.authUserId !== 'string' || !isValidUUID(body.authUserId)) {
      throw new ValidationError('authUserId invalide.');
    }
    authUserId = body.authUserId;
  }

  const { row, error } = await repo.insertCastMember(ctx.db, {
    tenant_id: ctx.tenantId,
    name: body.name.trim(),
    title: body.title?.trim() || null,
    description: body.description?.trim() || null,
    image_url: sanitizeUrl(body.imageUrl),
    twitch_url: sanitizeUrl(body.twitchUrl),
    city: body.city?.trim() || null,
    is_active: body.isActive ?? true,
    is_promo: body.isPromo ?? false,
    sort_order: body.sortOrder ?? nextOrder,
    auth_user_id: authUserId,
  });
  if (error || !row) {
    ctx.logger.error('[admin/cast-members] create error', error);
    throw writeError(error ?? {}, 'Failed to create the cast member.');
  }
  return row;
}

export async function getCastMember(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.findCastMember(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/cast-members] get error', error);
    throw new NotFoundError('Cast member not found.');
  }
  return row;
}

export async function updateCastMember(
  ctx: ServiceContext,
  id: string,
  raw: unknown
) {
  const body = raw as CastMemberPayload;
  const update: CastMemberUpdate = {};

  if (typeof body.name === 'string') update.name = body.name.trim();
  if ('title' in body) update.title = body.title?.trim() || null;
  if ('description' in body)
    update.description = body.description?.trim() || null;
  if ('imageUrl' in body) update.image_url = sanitizeUrl(body.imageUrl);
  if ('twitchUrl' in body) update.twitch_url = sanitizeUrl(body.twitchUrl);
  if ('city' in body) update.city = body.city?.trim() || null;
  if ('isActive' in body) update.is_active = !!body.isActive;
  if ('isPromo' in body) update.is_promo = !!body.isPromo;
  if ('sortOrder' in body && Number.isFinite(body.sortOrder))
    update.sort_order = Number(body.sortOrder);
  if ('authUserId' in body) {
    if (body.authUserId === null || body.authUserId === '') {
      update.auth_user_id = null;
    } else if (
      typeof body.authUserId === 'string' &&
      isValidUUID(body.authUserId)
    ) {
      update.auth_user_id = body.authUserId;
    } else {
      throw new ValidationError('authUserId invalide.');
    }
  }

  const { row, error } = await repo.updateCastMember(
    ctx.db,
    ctx.tenantId,
    id,
    update
  );
  if (error) {
    ctx.logger.error('[admin/cast-members] update error', error);
    throw writeError(error, 'Failed to update the cast member.');
  }
  return { row, fields: Object.keys(update) };
}

export async function deleteCastMember(ctx: ServiceContext, id: string) {
  const { error } = await repo.deleteCastMember(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/cast-members] delete error', error);
    throw new AdminError(500, 'internal', 'Failed to delete the cast member.');
  }
}

/* ---- Casters disponibles ---- */

const WINDOW_HOURS_DEFAULT = 2;
const WINDOW_HOURS_MAX = 12;

/**
 * Comptes staff `caster` + leur fiche liée. Avec `matchScheduledAt`, marque
 * `conflictsWithWindow` ceux déjà assignés à un match planifié dans
 * [t - windowHours, t + windowHours] : l'UI les grise.
 */
export async function listAvailableCasters(
  ctx: ServiceContext,
  query: Query
): Promise<{ items: AvailableCaster[]; windowHours: number }> {
  const { rows: casters, error: staffErr } = await repo.listCasterStaff(ctx.db);
  if (staffErr) {
    ctx.logger.error('[admin/available-casters] staff list error', staffErr);
    throw new AdminError(500, 'internal', 'Failed to load staff.');
  }

  // `auth_user_id` est nullable au schéma : un `IN (NULL)` ne matche rien en
  // SQL, on ne l’envoie donc pas.
  const userIds = casters
    .map((c) => c.auth_user_id)
    .filter((id): id is string => !!id);
  let linkedMap = new Map<string, string>();
  if (casters.length > 0) {
    const { rows: links, error: linksErr } = await repo.listLinkedCastMembers(
      ctx.db,
      ctx.tenantId,
      userIds
    );
    if (linksErr) {
      ctx.logger.error('[admin/available-casters] links error', linksErr);
      throw new AdminError(500, 'internal', 'Failed to load existing links.');
    }
    linkedMap = new Map(
      links
        .filter((l) => l.auth_user_id)
        .map((l) => [l.auth_user_id as string, l.id])
    );
  }

  const matchScheduledAt =
    typeof query.matchScheduledAt === 'string' ? query.matchScheduledAt : null;
  const windowHoursRaw =
    typeof query.windowHours === 'string' ? Number(query.windowHours) : NaN;
  const windowHours = Number.isFinite(windowHoursRaw)
    ? Math.min(Math.max(windowHoursRaw, 0.5), WINDOW_HOURS_MAX)
    : WINDOW_HOURS_DEFAULT;

  let conflicting = new Set<string>();
  if (matchScheduledAt && !Number.isNaN(Date.parse(matchScheduledAt))) {
    const t = new Date(matchScheduledAt).getTime();
    const lo = new Date(t - windowHours * 3_600_000).toISOString();
    const hi = new Date(t + windowHours * 3_600_000).toISOString();
    const { ids, error: busyErr } = await repo.listBusyCastMemberIds(
      ctx.db,
      ctx.tenantId,
      lo,
      hi
    );
    if (busyErr) {
      // Pas bloquant : la liste sort sans marquage de conflit.
      ctx.logger.error('[admin/available-casters] busy lookup error', busyErr);
    } else {
      conflicting = new Set(ids);
    }
  }

  const items: AvailableCaster[] = casters.map((c) => {
    const linkedId = c.auth_user_id
      ? (linkedMap.get(c.auth_user_id) ?? null)
      : null;
    return {
      authUserId: c.auth_user_id,
      displayName: c.display_name,
      email: c.email,
      avatarUrl: c.avatar_url,
      linkedCastMemberId: linkedId,
      conflictsWithWindow: linkedId !== null && conflicting.has(linkedId),
    };
  });
  return { items, windowHours };
}
