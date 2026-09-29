// features/admin/partners/service.ts — partenaires de l'association et liste
// des demandes de partenariat.
//
// Donnée d'association sans tenant : `ctx.tenantId` n'est pas utilisé ici
// (la garde est `scope: 'platform'`). Messages d'erreur inchangés : la page
// partenaires les affiche.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import {
  escapePostgrestValue,
  sanitizeSearch,
  sanitizeUrl,
} from '@/utils/apiHelpers';
import { resolvePartnerLogo } from '@/utils/partners/partnerLogo';
import type { Database } from '@/types/database.generated';
import * as repo from './repository';
import { PARTNER_CATEGORIES, type PartnerPayload } from './schemas';

type QueryValue = string | string[] | undefined;
type Query = Record<string, QueryValue>;
type Pagination = { limit: number; offset: number };
type PartnerUpdate = Database['public']['Tables']['partners']['Update'];

const INVALID_CATEGORY =
  'Invalid category. Allowed values: super, major, cultural.';

const isCategory = (v: unknown): v is (typeof PARTNER_CATEGORIES)[number] =>
  (PARTNER_CATEGORIES as readonly unknown[]).includes(v);

// Allowlist de tri (clé exposée → colonne DB).
const PARTNER_SORT_COLUMNS: Record<string, string> = {
  category: 'category',
  display_order: 'display_order',
  created_at: 'created_at',
  name: 'name',
};

async function resolveLogoOrThrow(raw: string | undefined) {
  const logo = await resolvePartnerLogo(raw);
  if (!logo.ok) {
    throw new LegacyAdminError(400, logo.error, { code: 'LOGO_REHOST_FAILED' });
  }
  return logo.logoUrl;
}

export async function listPartners(
  ctx: ServiceContext,
  page: Pagination,
  query: Query
) {
  const { category, active, orderBy, orderDir, includeTotal } = query;

  if (category && typeof category === 'string' && !isCategory(category)) {
    throw new ValidationError('Invalid category.');
  }

  const search = sanitizeSearch(query.search);
  // Tri serveur via allowlist ; sinon l'ordre historique (category,
  // display_order, created_at) tous ascendants.
  const sortKey =
    typeof orderBy === 'string' && orderBy in PARTNER_SORT_COLUMNS
      ? orderBy
      : null;

  const { rows, count, error } = await repo.listPartners(ctx.db, {
    ...page,
    withTotal: includeTotal === '1' || includeTotal === 'true',
    category: category && typeof category === 'string' ? category : undefined,
    active: active === 'true' ? true : active === 'false' ? false : undefined,
    search: search ? escapePostgrestValue(search) : undefined,
    sort: sortKey
      ? {
          column: PARTNER_SORT_COLUMNS[sortKey],
          ascending: orderDir !== 'desc',
        }
      : undefined,
  });
  if (error) {
    ctx.logger.error('[admin/partners] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load partners.');
  }
  return { items: rows, total: typeof count === 'number' ? count : null };
}

export async function createPartner(ctx: ServiceContext, raw: unknown) {
  const body = raw as PartnerPayload;
  if (!body?.name || !body.description || !body.category) {
    throw new ValidationError('Name, description and category are required.');
  }
  if (!isCategory(body.category)) {
    throw new ValidationError(INVALID_CATEGORY);
  }

  const logoUrl = await resolveLogoOrThrow(body.logoUrl);

  const { row, error } = await repo.insertPartner(ctx.db, {
    name: body.name,
    description: body.description,
    category: body.category,
    logo_url: logoUrl,
    website_url: sanitizeUrl(body.websiteUrl),
    note: body.note ?? null,
    display_order: body.displayOrder ?? 0,
    is_active: body.isActive ?? true,
  });
  if (error || !row) {
    ctx.logger.error('[admin/partners] create error', error);
    throw new AdminError(500, 'internal', 'Failed to create the partner.');
  }
  return row;
}

export async function getPartner(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.findPartner(ctx.db, id);
  if (error || !row) throw new NotFoundError('Partner not found.');
  return row;
}

export async function updatePartner(
  ctx: ServiceContext,
  id: string,
  raw: unknown
) {
  // `req.body` absent faisait lever la lecture des champs → 500 : conservé.
  const body = raw as PartnerPayload;
  const updates: PartnerUpdate = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.category !== undefined) {
    if (!isCategory(body.category)) {
      throw new ValidationError(INVALID_CATEGORY);
    }
    updates.category = body.category;
  }
  if (body.logoUrl !== undefined) {
    updates.logo_url = await resolveLogoOrThrow(body.logoUrl);
  }
  if (body.websiteUrl !== undefined)
    updates.website_url = sanitizeUrl(body.websiteUrl);
  if (body.note !== undefined) updates.note = body.note || null;
  if (body.displayOrder !== undefined)
    updates.display_order = body.displayOrder;
  if (body.isActive !== undefined) updates.is_active = body.isActive;

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No changes provided.');
  }

  const { row, error } = await repo.updatePartner(ctx.db, id, updates);
  if (error) {
    ctx.logger.error('[admin/partners] update error', error);
    throw new AdminError(500, 'internal', 'Failed to update the partner.');
  }
  if (!row) throw new NotFoundError('Partner not found.');
  return { row, updates };
}

export async function deletePartner(ctx: ServiceContext, id: string) {
  const existing = await repo.findPartnerName(ctx.db, id);
  if (!existing) throw new NotFoundError('Partner not found.');

  const { error } = await repo.deletePartner(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/partners] delete error', error);
    throw new AdminError(500, 'internal', 'Failed to delete the partner.');
  }
  return { name: existing.name };
}

/* ---- Demandes de partenariat (liste) ---- */

// Colonnes de tri autorisées.
const REQUEST_ORDER_BY = new Set(['created_at']);

/**
 * Liste paginée/filtrée + compteurs par statut. Les compteurs couvrent
 * TOUTES les demandes (hors filtres), pour les badges : une seule lecture de
 * `status` agrégée ici — table mono-tenant de faible volume, index-only scan.
 */
export async function listPartnershipRequests(
  ctx: ServiceContext,
  page: Pagination,
  query: Query
) {
  const { status, category, orderBy, orderDir, includeTotal } = query;
  const search = sanitizeSearch(query.search);

  const { rows, count, error } = await repo.listPartnershipRequests(ctx.db, {
    ...page,
    withTotal: includeTotal === '1' || includeTotal === 'true',
    sortColumn:
      typeof orderBy === 'string' && REQUEST_ORDER_BY.has(orderBy)
        ? orderBy
        : 'created_at',
    ascending: orderDir === 'asc',
    status: status && typeof status === 'string' ? status : undefined,
    category: category && typeof category === 'string' ? category : undefined,
    searchPattern: search ? `%${escapePostgrestValue(search)}%` : undefined,
  });
  if (error) {
    ctx.logger.error('[admin/partnership-requests] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load requests.');
  }

  const counts: Record<string, number> = {};
  for (const row of await repo.listPartnershipRequestStatuses(ctx.db)) {
    const key = row.status ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return {
    items: rows,
    counts,
    total: typeof count === 'number' ? count : null,
  };
}
