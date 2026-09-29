// features/admin/pole-members/service.ts — membres des pôles de
// l'association. La page publique /association est régénérée par la route
// (`res.revalidate`) après chaque écriture.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { isPoleKey } from '@/utils/associationPoles';
import type { Database } from '@/types/database.generated';
import * as repo from './repository';
import type { PoleMemberPayload } from './schemas';

type QueryValue = string | string[] | undefined;
type PoleMemberUpdate =
  Database['public']['Tables']['association_pole_members']['Update'];

export async function listPoleMembers(
  ctx: ServiceContext,
  query: Record<string, QueryValue>
) {
  const poleKey = query.poleKey;
  const { rows, error } = await repo.listPoleMembers(ctx.db, {
    limit: Math.max(1, Math.min(500, Number(query.limit) || 200)),
    includeInactive: query.includeInactive === 'true',
    poleKey:
      typeof poleKey === 'string' && isPoleKey(poleKey) ? poleKey : undefined,
  });
  if (error) {
    ctx.logger.error('[admin/pole-members] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load pole members.');
  }
  return { items: rows };
}

export async function createPoleMember(ctx: ServiceContext, raw: unknown) {
  // `req.body` absent faisait lever la lecture des champs → 500 : conservé.
  const body = raw as PoleMemberPayload;
  if (!body.name || !body.name.trim()) {
    throw new ValidationError('Name is required.');
  }
  if (!isPoleKey(body.poleKey)) {
    throw new ValidationError('Invalid or missing poleKey.');
  }

  const nextOrder = (await repo.maxSortOrder(ctx.db, body.poleKey)) + 1;

  const { row, error } = await repo.insertPoleMember(ctx.db, {
    pole_key: body.poleKey,
    name: body.name.trim(),
    title: body.title?.trim() || null,
    description: body.description?.trim() || null,
    image_url: sanitizeUrl(body.imageUrl),
    link_url: sanitizeUrl(body.linkUrl),
    is_active: body.isActive ?? true,
    sort_order: Number.isFinite(body.sortOrder)
      ? Number(body.sortOrder)
      : nextOrder,
  });
  if (error || !row) {
    ctx.logger.error('[admin/pole-members] create error', error);
    throw new AdminError(500, 'internal', 'Failed to create the pole member.');
  }
  return row;
}

export async function getPoleMember(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.findPoleMember(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/pole-members] get error', error);
    throw new NotFoundError('Pole member not found.');
  }
  return row;
}

export async function updatePoleMember(
  ctx: ServiceContext,
  id: string,
  raw: unknown
) {
  const body = raw as PoleMemberPayload;
  const update: PoleMemberUpdate = {};

  if ('poleKey' in body) {
    if (!isPoleKey(body.poleKey)) {
      throw new ValidationError('Invalid poleKey.');
    }
    update.pole_key = body.poleKey;
  }
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) throw new ValidationError('Name cannot be empty.');
    update.name = trimmed;
  }
  if ('title' in body) update.title = body.title?.trim() || null;
  if ('description' in body)
    update.description = body.description?.trim() || null;
  if ('imageUrl' in body) update.image_url = sanitizeUrl(body.imageUrl);
  if ('linkUrl' in body) update.link_url = sanitizeUrl(body.linkUrl);
  if ('isActive' in body) update.is_active = !!body.isActive;
  if ('sortOrder' in body && Number.isFinite(body.sortOrder))
    update.sort_order = Number(body.sortOrder);

  const { row, error } = await repo.updatePoleMember(ctx.db, id, update);
  if (error) {
    ctx.logger.error('[admin/pole-members] update error', error);
    throw new AdminError(500, 'internal', 'Failed to update the pole member.');
  }
  return { row, fields: Object.keys(update) };
}

export async function deletePoleMember(ctx: ServiceContext, id: string) {
  const { error } = await repo.deletePoleMember(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/pole-members] delete error', error);
    throw new AdminError(500, 'internal', 'Failed to delete the pole member.');
  }
}
