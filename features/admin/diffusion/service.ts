// features/admin/diffusion/service.ts — ce que voit tout le staff de la
// diffusion (rôle caster) : run en direct, chaînes à l'antenne, overlays vus.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import { sanitizeUrl } from '@/utils/apiHelpers';
import type { TwitchChannelBody, TwitchChannelPatch } from './schemas';
import * as repo from './repository';

const readFailed = (ctx: ServiceContext, where: string, error: unknown) => {
  ctx.logger.error(`[admin/diffusion/${where}] lecture impossible`, error);
  return new AdminError(500, 'internal', 'Lecture impossible.');
};

/** « Y a-t-il un run en direct ? » — le point rouge de la barre Diffusion. */
export async function getLiveStatus(ctx: ServiceContext) {
  const { run, error } = await repo.findLiveRun(ctx.db, ctx.tenantId);
  if (error) throw readFailed(ctx, 'live-status', error);
  return { live: Boolean(run), runName: run?.name ?? null };
}

/**
 * Chaînes Twitch actives, en lecture seule. La route d'ÉDITION exige
 * `manage_broadcast` ; ce sont pourtant les casteuses qui sont à l'antenne.
 */
export async function listOnAirChannels(ctx: ServiceContext) {
  const { rows, error } = await repo.listActiveTwitchChannels(
    ctx.db,
    ctx.tenantId
  );
  if (error) throw readFailed(ctx, 'twitch-channels', error);
  const items = rows
    .filter((r) => r.channel)
    .map((r) => ({ channel: r.channel, label: r.label ?? null }));
  return { items };
}

/**
 * Dernier signal de chaque overlay. `now` est l'heure du SERVEUR : la
 * comparer à l'horloge du poste fausserait l'état dès qu'elle dérive.
 */
export async function getOverlayPresence(ctx: ServiceContext) {
  const { rows, error } = await repo.listOverlayHeartbeats(
    ctx.db,
    ctx.tenantId
  );
  if (error) throw readFailed(ctx, 'overlay-presence', error);
  const sources: Record<string, string> = {};
  for (const row of rows) sources[row.source] = row.last_seen_at;
  return { sources, now: new Date().toISOString() };
}

/* ------------------------------------------------------------------------
 * Édition de la liste des chaînes (permission manage_broadcast)
 * --------------------------------------------------------------------- */

const UNIQUE_VIOLATION = '23505';

/** Doublon de chaîne : erreur DE CHAMP, pour que le formulaire la place. */
const duplicateChannel = () =>
  new ValidationError('Cette chaîne existe déjà.', {
    channel: 'Cette chaîne existe déjà.',
  });

export async function listTwitchChannelsForEdit(
  ctx: ServiceContext,
  opts: { limit: number; includeInactive: boolean }
) {
  const { rows, error } = await repo.listTwitchChannels(
    ctx.db,
    ctx.tenantId,
    opts
  );
  if (error) {
    ctx.logger.error('[admin/twitch-channels] list error', error);
    throw new AdminError(500, 'internal', 'Chargement des chaînes impossible.');
  }
  return { items: rows };
}

export async function getTwitchChannelById(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.getTwitchChannel(ctx.db, ctx.tenantId, id);
  if (error) ctx.logger.error('[admin/twitch-channels] get error', error);
  if (!row) throw new NotFoundError('Chaîne introuvable.');
  return row;
}

export async function createTwitchChannel(
  ctx: ServiceContext,
  body: TwitchChannelBody
) {
  const sortOrder =
    body.sortOrder ?? (await repo.maxTwitchSortOrder(ctx.db, ctx.tenantId)) + 1;
  const { row, error } = await repo.insertTwitchChannel(ctx.db, {
    tenant_id: ctx.tenantId,
    channel: body.channel,
    label: body.label,
    badge: body.badge,
    description: body.description,
    background_url: sanitizeUrl(body.backgroundUrl),
    is_active: body.isActive ?? true,
    sort_order: sortOrder,
  });
  if (error?.code === UNIQUE_VIOLATION) throw duplicateChannel();
  if (error || !row) {
    ctx.logger.error('[admin/twitch-channels] create error', error);
    throw new AdminError(500, 'internal', 'Création de la chaîne impossible.');
  }
  return row;
}

export async function updateTwitchChannelById(
  ctx: ServiceContext,
  id: string,
  patch: TwitchChannelPatch
) {
  // Seuls les champs PRÉSENTS dans le corps sont écrits.
  const update: Record<string, unknown> = {};
  if (patch.channel !== undefined) update.channel = patch.channel;
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.badge !== undefined) update.badge = patch.badge;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.backgroundUrl !== undefined)
    update.background_url = sanitizeUrl(patch.backgroundUrl);
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { row, error } = await repo.updateTwitchChannel(
    ctx.db,
    ctx.tenantId,
    id,
    update
  );
  if (error?.code === UNIQUE_VIOLATION) throw duplicateChannel();
  if (error || !row) {
    ctx.logger.error('[admin/twitch-channels] update error', error);
    throw new AdminError(
      500,
      'internal',
      'Mise à jour de la chaîne impossible.'
    );
  }
  return { row, fields: Object.keys(update) };
}

export async function deleteTwitchChannelById(ctx: ServiceContext, id: string) {
  const { error } = await repo.deleteTwitchChannel(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/twitch-channels] delete error', error);
    throw new AdminError(
      500,
      'internal',
      'Suppression de la chaîne impossible.'
    );
  }
}
