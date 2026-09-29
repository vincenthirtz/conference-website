// features/admin/diffusion/service.ts — ce que voit tout le staff de la
// diffusion (rôle caster) : run en direct, chaînes à l'antenne, overlays vus.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { LegacyAdminError } from '@/utils/admin/errors';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import { emitBotEvent } from '@/utils/botEvents';
import {
  BROADCAST_SCENES,
  type BroadcastLiveState,
  fetchLiveBroadcastState,
  setBroadcastScene,
  updateBroadcastState,
} from '@/utils/broadcast/liveState';
import { transitionToSegment } from '@/utils/broadcast/segmentTransition';
import type { Audited } from '../_shared/audited';
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

  // L'état d'avant, pour que le journal dise ce qui a changé (lot L8).
  const { row: before } = await repo.getTwitchChannel(ctx.db, ctx.tenantId, id);
  if (!before) throw new NotFoundError('Chaîne introuvable.');

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
  return { row, before, fields: Object.keys(update) };
}

export async function deleteTwitchChannelById(ctx: ServiceContext, id: string) {
  // Lue avant de disparaître : la photo du journal est tout ce qu'il en
  // restera. Absente = rien à supprimer, et rien à photographier.
  const { row: before } = await repo.getTwitchChannel(ctx.db, ctx.tenantId, id);
  const { error } = await repo.deleteTwitchChannel(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/twitch-channels] delete error', error);
    throw new AdminError(
      500,
      'internal',
      'Suppression de la chaîne impossible.'
    );
  }
  return { before };
}

/* ------------------------------------------------------------------------
 * Régie vidéo : état d'antenne et « match suivant »
 * (ex-pages/api/admin/broadcast/{state,next-match}.ts)
 * --------------------------------------------------------------------- */

const STUDIO_DENIAL_MESSAGE =
  'La régie vidéo (direction automatique et overlays OBS) fait partie de l’offre Éditeur, sur devis.';

/**
 * La régie vidéo est une capacité de palier (`broadcastStudio`, offre
 * Éditeur) : 402 `PLAN_CAPABILITY_REQUIRED` sinon. Porte sur la CONSOLE, pas
 * sur l'overlay (la sortie vidéo). Fail-open si le plan est illisible.
 */
async function requireBroadcastStudio(ctx: ServiceContext) {
  const denial = await capabilityDenial(
    ctx.tenantId,
    'broadcastStudio',
    STUDIO_DENIAL_MESSAGE
  );
  if (denial) {
    const { error, code, ...extra } = denial;
    throw new LegacyAdminError(402, error, { code, extra });
  }
}

/** État agrégé du run live (run, segment courant, match, casters, overlay). */
export async function getBroadcastState(ctx: ServiceContext) {
  await requireBroadcastStudio(ctx);
  return fetchLiveBroadcastState(ctx.tenantId);
}

const invalid = (error: string) => new LegacyAdminError(400, error);

/**
 * Mise à jour partielle de `broadcast_state` du run live. Ordre d'origine :
 * palier → validation → droit d'écriture (`manage_broadcast`, porté par
 * `canEdit`) → 409 sans run live → écriture → outbox bot (best-effort).
 */
export async function patchBroadcastState(
  ctx: ServiceContext,
  raw: Record<string, unknown>,
  canEdit: boolean
): Promise<Audited<BroadcastLiveState>> {
  await requireBroadcastStudio(ctx);

  const patch: Record<string, unknown> = {};
  if (raw.on_air !== undefined) {
    if (typeof raw.on_air !== 'boolean')
      throw invalid('on_air must be a boolean');
    patch.on_air = raw.on_air;
  }
  if (raw.lower_third !== undefined) {
    if (raw.lower_third !== null && typeof raw.lower_third !== 'string') {
      throw invalid('lower_third must be a string or null');
    }
    if (typeof raw.lower_third === 'string' && raw.lower_third.length > 500) {
      throw invalid('lower_third too long (max 500 chars)');
    }
    patch.lower_third = raw.lower_third;
  }
  if (raw.pip !== undefined) {
    const pip = raw.pip as { enabled?: unknown } | null | undefined;
    if (!pip || typeof pip !== 'object' || typeof pip.enabled !== 'boolean') {
      throw invalid('pip must be { enabled: boolean }');
    }
    patch.pip = { enabled: pip.enabled };
  }
  if (raw.scene !== undefined) {
    if (
      typeof raw.scene !== 'string' ||
      !(BROADCAST_SCENES as readonly string[]).includes(raw.scene)
    ) {
      throw invalid(`scene must be one of: ${BROADCAST_SCENES.join(', ')}`);
    }
    patch.scene = raw.scene;
  }
  if (raw.auto_director !== undefined) {
    if (typeof raw.auto_director !== 'boolean') {
      throw invalid('auto_director must be a boolean');
    }
    patch.auto_director = raw.auto_director;
  }
  if (Object.keys(patch).length === 0) throw invalid('No fields to update');

  // Écrire l'état d'antenne = piloter la régie : le DROIT `manage_broadcast`
  // (pas le rôle caster), comme start/end/next-match.
  if (!canEdit) throw new LegacyAdminError(403, 'Caster cannot edit state');

  const current = await fetchLiveBroadcastState(ctx.tenantId);
  if (!current.run) {
    throw new LegacyAdminError(
      409,
      'No live event_run for this tenant. Start a run first.',
      { code: 'NO_LIVE_RUN' }
    );
  }

  const next = await updateBroadcastState(
    ctx.tenantId,
    current.run.id,
    patch as never
  );
  if (!next) {
    throw new LegacyAdminError(500, 'Failed to update broadcast_state');
  }

  // Outbox best-effort : le bot rafraîchit le panneau lives-board sans
  // attendre son prochain tick.
  try {
    await emitBotEvent(
      'broadcast.state_changed',
      {
        runId: current.run.id,
        runSlug: current.run.slug,
        state: next,
        currentSegmentId: current.currentSegment?.id ?? null,
        matchId: current.match?.matchId ?? null,
      },
      ctx.tenantId
    );
  } catch (e) {
    ctx.logger.error('[broadcast/state] emitBotEvent error', e);
  }

  return {
    result: await fetchLiveBroadcastState(ctx.tenantId),
    audit: {
      entity_type: 'event_run',
      entity_id: current.run.id,
      tournament_id: null,
      payload: { patch, new_state: next },
    },
  };
}

/**
 * « Match suivant » en un clic : prochain segment `match` upcoming après le
 * segment live, bascule atomique (`transitionToSegment`, même code que
 * segments/[segId]/start), puis scène overlay remise à `starting`
 * (best-effort) pour que l'auto-director reprenne proprement.
 */
export async function goToNextMatch(ctx: ServiceContext) {
  await requireBroadcastStudio(ctx);

  const live = await fetchLiveBroadcastState(ctx.tenantId);
  if (!live.run) {
    throw new LegacyAdminError(
      409,
      'No live event_run for this tenant. Start a run first.',
      { code: 'NO_LIVE_RUN' }
    );
  }
  if (!live.currentSegment) {
    throw new LegacyAdminError(
      409,
      'The live run has no current (live) segment.',
      { code: 'NO_CURRENT_SEGMENT' }
    );
  }

  const runId = live.run.id;
  const currentOrd = live.currentSegment.ord;

  const { row: next, error } = await repo.findNextUpcomingMatchSegment(
    ctx.db,
    ctx.tenantId,
    runId,
    currentOrd
  );
  if (error) {
    ctx.logger.error('[admin/broadcast/next-match] lookup error', error);
    throw new LegacyAdminError(500, 'Failed to resolve next match.');
  }
  if (!next) {
    throw new LegacyAdminError(
      409,
      'No upcoming match segment after the current one.',
      { code: 'NO_NEXT_MATCH' }
    );
  }

  const admin = ctx.db as unknown as Parameters<typeof transitionToSegment>[0];
  const result = await transitionToSegment(admin, {
    runId,
    tenantId: ctx.tenantId,
    segId: next.id,
  });
  if (!result.ok) {
    if (result.reason === 'not_found') {
      throw new LegacyAdminError(404, 'Next segment not found.');
    }
    if (result.reason === 'not_upcoming') {
      throw new LegacyAdminError(
        409,
        `Le segment cible est en status '${result.status}'.`,
        { code: 'SEGMENT_NOT_UPCOMING', extra: { status: result.status } }
      );
    }
    ctx.logger.error(
      '[admin/broadcast/next-match] transition error',
      result.error
    );
    throw new LegacyAdminError(500, 'Failed to switch to next match.');
  }

  await setBroadcastScene(admin, runId, 'starting').catch((e) =>
    ctx.logger.error('[admin/broadcast/next-match] setBroadcastScene error', e)
  );

  return {
    result: {
      segment: result.segment,
      alreadyStarted: result.alreadyStarted,
      runId,
    },
    audit: {
      entity_type: 'event_segment',
      entity_id: next.id,
      payload: {
        action: 'broadcast_next_match',
        runId,
        fromOrd: currentOrd,
        toOrd: next.ord,
      },
    },
  };
}
