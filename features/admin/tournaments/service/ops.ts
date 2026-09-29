// features/admin/tournaments/service/ops.ts — exploitation d'un tournoi :
// check-in (état, relance du processeur, délai de grâce, relance groupée des
// équipes non checkées) et webhooks Discord (configuration, message de test).
//
// Les mécaniques restent dans utils/checkin (même jeton, même event
// `checkin.nudge` que la relance par match) : ce service les orchestre.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  buildCheckinUrl,
  generateCheckinToken,
  listCheckinStatus,
  processCheckinForUpcomingMatches,
} from '@/utils/checkin';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { postToDiscordWebhook } from '@/utils/discord';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/ops';
import { DISCORD_CHANNEL_TYPES, type DiscordChannelType } from '../schemas';
import { fail, staffIdOf } from './common';

/* ---------------------------------------------------------------------------
 * Check-in : état et relance manuelle du processeur
 * ------------------------------------------------------------------------ */

export async function checkinStatus(ctx: ServiceContext, tournamentId: string) {
  return { matches: await listCheckinStatus(ctx.tenantId, tournamentId) };
}

export async function runCheckin(ctx: ServiceContext, tournamentId: string) {
  const summary = await processCheckinForUpcomingMatches({
    tournamentId,
    tenantId: ctx.tenantId,
  });
  return {
    result: { success: true, ...summary },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        kind: 'checkin_manual_run',
        scanned: summary.scanned,
        acted: summary.acted,
        errors: summary.errors,
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Délai de grâce (lecture DÉFENSIVE : colonnes peut-être pas encore migrées)
 * ------------------------------------------------------------------------ */

const DEFAULT_GRACE_MINUTES = 60;
const MIN_GRACE_MINUTES = 0;
const MAX_GRACE_MINUTES = 120;
// Code Postgres « colonne inconnue » (select comme update).
const PG_UNDEFINED_COLUMN = '42703';

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === PG_UNDEFINED_COLUMN) return true;
  // PostgREST remonte parfois l'erreur en message plutôt qu'en code.
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes('checkin_grace_minutes') ||
    msg.includes('no_show_reason') ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

async function readGrace(ctx: ServiceContext, tournamentId: string) {
  try {
    const { data, error } = await repo.readGraceMinutes(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    if (error) {
      if (isMissingColumnError(error)) {
        return { value: DEFAULT_GRACE_MINUTES, migrated: false };
      }
      ctx.logger.error('[checkin-settings] readGraceMinutes error:', error);
      return { value: DEFAULT_GRACE_MINUTES, migrated: true };
    }
    const raw = data?.checkin_grace_minutes;
    return {
      value:
        typeof raw === 'number' && Number.isFinite(raw)
          ? raw
          : DEFAULT_GRACE_MINUTES,
      migrated: true,
    };
  } catch (err) {
    if (!isMissingColumnError(err)) {
      ctx.logger.error('[checkin-settings] readGraceMinutes exception:', err);
    }
    return { value: DEFAULT_GRACE_MINUTES, migrated: false };
  }
}

async function readNoShows(ctx: ServiceContext, tournamentId: string) {
  try {
    const { data, error } = await repo.readNoShowReasons(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    if (error) {
      if (!isMissingColumnError(error)) {
        ctx.logger.error('[checkin-settings] readNoShowReasons error:', error);
      }
      return {};
    }
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.no_show_reason) map[row.id] = row.no_show_reason;
    }
    return map;
  } catch (err) {
    if (!isMissingColumnError(err)) {
      ctx.logger.error('[checkin-settings] readNoShowReasons exception:', err);
    }
    return {};
  }
}

export async function checkinSettings(
  ctx: ServiceContext,
  tournamentId: string
) {
  const [grace, noShowReasons] = await Promise.all([
    readGrace(ctx, tournamentId),
    readNoShows(ctx, tournamentId),
  ]);
  return {
    checkinGraceMinutes: grace.value,
    migrated: grace.migrated,
    noShowReasons,
  };
}

export async function updateCheckinSettings(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const raw = body.checkinGraceMinutes;
  const minutes = typeof raw === 'string' ? Number(raw) : raw;
  if (
    typeof minutes !== 'number' ||
    !Number.isInteger(minutes) ||
    minutes < MIN_GRACE_MINUTES ||
    minutes > MAX_GRACE_MINUTES
  ) {
    fail(
      400,
      `checkinGraceMinutes doit être un entier entre ${MIN_GRACE_MINUTES} et ${MAX_GRACE_MINUTES}`
    );
  }
  const { error } = await repo.writeGraceMinutes(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    minutes
  );
  if (error) {
    // Migration absente : 503 explicite plutôt qu'un 500 opaque.
    if (isMissingColumnError(error)) {
      fail(
        503,
        'Réglage indisponible : la migration check-in (checkin_grace_minutes) n’a pas encore été appliquée.'
      );
    }
    ctx.logger.error('[checkin-settings] PATCH update error:', error);
    fail(500, 'Internal server error');
  }
  return {
    result: { success: true, checkinGraceMinutes: minutes },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        kind: 'checkin_settings_update',
        checkin_grace_minutes: minutes,
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Relance groupée des équipes non checkées (lot A1)
 * ------------------------------------------------------------------------ */

/** Fenêtre de relance : les matchs des prochaines 24 h. */
const NUDGE_WINDOW_HOURS = 24;

export async function nudgeAllMissing(
  ctx: ServiceContext,
  tournamentId: string
) {
  const until = new Date(
    Date.now() + NUDGE_WINDOW_HOURS * 60 * 60_000
  ).toISOString();
  const { data: rows, error } = await repo.upcomingMatchesForNudge(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    until
  );
  if (error) {
    ctx.logger.error('[checkin-nudge-all] read error', error);
    fail(500, 'Lecture des matchs impossible.');
  }

  let nudged = 0;
  const touchedMatches: string[] = [];
  for (const raw of rows ?? []) {
    const matchId = raw.id;
    const sides: (1 | 2)[] = [];
    if (!raw.team1_checked_in_at) sides.push(1);
    if (!raw.team2_checked_in_at) sides.push(2);
    if (sides.length === 0) continue;

    // Jetons manquants (le cron ne les pose qu'à T-60) : backfill idempotent.
    const updates: Record<string, string> = {};
    let token1 = raw.team1_checkin_token ?? null;
    let token2 = raw.team2_checkin_token ?? null;
    if (sides.includes(1) && !token1) {
      token1 = generateCheckinToken();
      updates.team1_checkin_token = token1;
    }
    if (sides.includes(2) && !token2) {
      token2 = generateCheckinToken();
      updates.team2_checkin_token = token2;
    }
    if (Object.keys(updates).length > 0) {
      const { error: tokErr } = await repo.setCheckinTokens(
        ctx.db,
        ctx.tenantId,
        matchId,
        updates
      );
      if (tokErr) ctx.logger.error('[checkin-nudge-all] token error', tokErr);
    }

    const enriched = await enrichMatchEvent(matchId).catch(() => null);
    for (const side of sides) {
      const token = side === 1 ? token1 : token2;
      try {
        await emitBotEvent(
          'checkin.nudge',
          {
            matchId,
            tournamentId,
            teamSide: side,
            scheduledAt: raw.scheduled_at ?? null,
            nudgedByStaffId: staffIdOf(ctx),
            checkinUrl: token ? buildCheckinUrl(token) : null,
            enriched,
          },
          ctx.tenantId
        );
        nudged += 1;
      } catch (e) {
        // Une relance ratée n'annule pas les autres.
        ctx.logger.error(
          '[checkin-nudge-all] emit error match=%s side=%d',
          matchId,
          side,
          e
        );
      }
    }
    touchedMatches.push(matchId);
  }

  return {
    result: { success: true, nudged, matches: touchedMatches.length },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: { scope: 'all_missing', nudged, matches: touchedMatches },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Webhooks Discord du tournoi
 * ------------------------------------------------------------------------ */

function isChannelType(v: unknown): v is DiscordChannelType {
  return (
    typeof v === 'string' &&
    (DISCORD_CHANNEL_TYPES as readonly string[]).includes(v)
  );
}

const INVALID_CHANNEL = `Invalid channelType. Allowed: ${DISCORD_CHANNEL_TYPES.join(', ')}`;

/** URL de webhook Discord (discordapp.com : alias historique accepté). */
function sanitizeWebhookUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    !/^https:\/\/(discord|ptb\.discord|canary\.discord|discordapp)\.com\/api\/webhooks\//.test(
      trimmed
    )
  ) {
    return null;
  }
  return trimmed;
}

export async function listWebhooks(ctx: ServiceContext, tournamentId: string) {
  const { data, error } = await repo.listWebhooks(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (error) {
    ctx.logger.error('[discord-webhooks] GET error:', error);
    fail(500, 'Failed to load webhooks');
  }
  const rows = data ?? [];
  return {
    channelTypes: DISCORD_CHANNEL_TYPES,
    scoped: rows.filter((w) => w.tournament_id === tournamentId),
    globals: rows.filter((w) => w.tournament_id === null),
  };
}

export async function upsertWebhook(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { channelType, webhookUrl, roleMention, isActive } = body;
  if (!isChannelType(channelType)) fail(400, INVALID_CHANNEL);
  const cleanUrl = sanitizeWebhookUrl(webhookUrl);
  if (!cleanUrl) {
    fail(
      400,
      'webhookUrl must be a valid https://discord.com/api/webhooks/... URL'
    );
  }
  const cleanRoleMention =
    typeof roleMention === 'string' && roleMention.trim()
      ? roleMention.trim()
      : null;

  const existing = await repo.findWebhookId(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    channelType
  );
  let webhook: unknown;
  if (existing?.id) {
    const { data, error } = await repo.updateWebhook(
      ctx.db,
      ctx.tenantId,
      existing.id,
      {
        webhook_url: cleanUrl,
        role_mention: cleanRoleMention,
        is_active: isActive !== false,
        updated_at: new Date().toISOString(),
      }
    );
    if (error) {
      ctx.logger.error('[discord-webhooks] update error:', error);
      fail(500, 'Failed to update webhook');
    }
    webhook = data;
  } else {
    const { data, error } = await repo.insertWebhook(ctx.db, {
      tenant_id: ctx.tenantId,
      tournament_id: tournamentId,
      channel_type: channelType,
      webhook_url: cleanUrl,
      role_mention: cleanRoleMention,
      is_active: isActive !== false,
    });
    if (error) {
      ctx.logger.error('[discord-webhooks] insert error:', error);
      fail(500, 'Failed to create webhook');
    }
    webhook = data;
  }

  return {
    result: { webhook },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        channel_type: channelType,
        has_role_mention: !!cleanRoleMention,
      },
    },
  } satisfies Audited<unknown>;
}

export async function deleteWebhook(
  ctx: ServiceContext,
  tournamentId: string,
  channelType: unknown
) {
  if (!isChannelType(channelType)) fail(400, INVALID_CHANNEL);
  const { error } = await repo.deleteWebhook(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    channelType
  );
  if (error) {
    ctx.logger.error('[discord-webhooks] delete error:', error);
    fail(500, 'Failed to delete webhook');
  }
  return {
    result: { success: true },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: { channel_type: channelType },
    },
  } satisfies Audited<unknown>;
}

/** Message de test sur le webhook actif (du tournoi, sinon global). */
export async function testWebhook(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { channelType } = body;
  if (!isChannelType(channelType)) fail(400, 'Invalid channelType');

  const cfg =
    (await repo.activeWebhook(
      ctx.db,
      ctx.tenantId,
      tournamentId,
      channelType
    )) ?? (await repo.activeWebhook(ctx.db, ctx.tenantId, null, channelType));
  if (!cfg?.webhook_url) {
    fail(404, `No active webhook configured for ${channelType}`);
  }

  await postToDiscordWebhook(cfg.webhook_url, {
    username: "OW Women's Cup — Test",
    embeds: [
      {
        title: '🧪 Test webhook',
        description: `Le webhook \`${channelType}\` fonctionne correctement.`,
        color: 0x10b981,
        timestamp: new Date().toISOString(),
        footer: {
          text: cfg.tournament_id
            ? 'Configuration spécifique au tournoi'
            : 'Configuration globale (fallback)',
        },
      },
    ],
  });
  return { success: true };
}
