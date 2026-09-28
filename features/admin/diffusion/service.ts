// features/admin/diffusion/service.ts — ce que voit tout le staff de la
// diffusion (rôle caster) : run en direct, chaînes à l'antenne, overlays vus.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
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
