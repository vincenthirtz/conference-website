// features/admin/site-settings/service.ts — règles des réglages du site par
// tenant : clés libres, calendrier des logos d'événement, rôles d'équipe et
// webhooks Discord « globaux » (fallback maître des webhooks de tournoi).
//
// Les messages d'erreur sont ceux d'avant la migration, au caractère près :
// les écrans de réglages les affichent tels quels.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import { getSetting, setSetting } from '@/utils/siteSettings';
import {
  SEASONAL_LOGOS_SETTING_KEY,
  SeasonalLogoListSchema,
  parseSeasonalLogos,
  pickActiveSeasonalLogo,
  todayInParis,
  type SeasonalLogo,
} from '@/utils/seasonalLogo';
import {
  TEAM_PERMISSION_VALUES,
  TEAM_ROLES_SETTING_KEY,
  isTeamPermission,
  loadTeamRolesFromSupabase,
  serializeTeamRoles,
  type TeamPermission,
  type TeamRole,
} from '@/utils/teamRoles';
import { postToDiscordWebhook } from '@/utils/discord';
import {
  DISCORD_CHANNEL_TYPES,
  type DiscordChannelType,
  isDiscordChannelType,
  sanitizeDiscordWebhookUrl,
} from '@/utils/discord/channels';
import * as repo from './repository';
import { INVALID_CHANNEL_TYPE_MESSAGE } from './schemas';

/** Le corps tel que reçu : ces routes n'ont jamais typé leur entrée. */
function fieldsOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/* ---- Clés libres (/api/admin/site-settings, /[key]) ---- */

export async function listSettings(ctx: ServiceContext) {
  const { rows, error } = await repo.listSettings(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/site-settings] list error', error);
    throw new AdminError(500, 'internal', 'Failed to load settings.');
  }
  return { items: rows };
}

type SettingBody = { key?: any; value?: unknown; description?: any };

export async function upsertSetting(ctx: ServiceContext, raw: unknown) {
  // `req.body` absent faisait lever la déstructuration → 500 : conservé.
  const { key, value, description } = raw as SettingBody;
  if (!key?.trim() || value === undefined) {
    throw new ValidationError('Key and value required.');
  }
  const cleanKey: string = key.trim();

  const { row, error } = await repo.upsertSetting(ctx.db, ctx.tenantId, {
    key: cleanKey,
    // Valeur transmise telle quelle, comme avant (colonne `text`).
    value: value as string,
    description: description?.trim() || null,
    updated_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
  });
  if (error) {
    ctx.logger.error('[admin/site-settings] upsert error', error);
    throw new AdminError(500, 'internal', 'Failed to save the setting.');
  }
  return { row, key: cleanKey, value };
}

export async function getSettingByKey(ctx: ServiceContext, key: string) {
  const { row, error } = await repo.getSetting(ctx.db, ctx.tenantId, key);
  if (error) {
    ctx.logger.error('[admin/site-settings] get error', error);
    throw new NotFoundError('Setting not found.');
  }
  return row;
}

export async function updateSettingByKey(
  ctx: ServiceContext,
  key: string,
  raw: unknown
) {
  const { value, description } = raw as SettingBody;
  if (value === undefined) {
    throw new ValidationError('Value required.');
  }

  const { row, error } = await repo.updateSetting(ctx.db, ctx.tenantId, key, {
    value: value as string,
    updated_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    ...(description !== undefined
      ? { description: description?.trim() || null }
      : {}),
  });
  if (error) {
    ctx.logger.error('[admin/site-settings] update error', error);
    throw new AdminError(500, 'internal', 'Failed to update the setting.');
  }
  return { row, value };
}

export async function deleteSettingByKey(ctx: ServiceContext, key: string) {
  const { error } = await repo.deleteSetting(ctx.db, ctx.tenantId, key);
  if (error) {
    ctx.logger.error('[admin/site-settings] delete error', error);
    throw new AdminError(500, 'internal', 'Failed to delete the setting.');
  }
}

/* ---- Logos d'événement (/api/admin/site-settings/seasonal-logos) ---- */

function seasonalView(logos: SeasonalLogo[]) {
  const today = todayInParis();
  return {
    logos,
    activeId: pickActiveSeasonalLogo(logos, today)?.id ?? null,
    today,
  };
}

export async function getSeasonalLogos(ctx: ServiceContext) {
  return seasonalView(
    parseSeasonalLogos(
      await getSetting(SEASONAL_LOGOS_SETTING_KEY, ctx.tenantId)
    )
  );
}

/**
 * Remplace la liste ENTIÈRE : l'écran édite un calendrier, et deux entrées ne
 * se valident pas indépendamment (identifiants uniques, plafond).
 */
export async function replaceSeasonalLogos(ctx: ServiceContext, raw: unknown) {
  const parsed = SeasonalLogoListSchema.safeParse(fieldsOf(raw).logos);
  if (!parsed.success) {
    throw new LegacyAdminError(
      400,
      parsed.error.issues[0]?.message ?? 'Liste invalide.',
      { code: 'invalid_body' }
    );
  }
  const logos = parsed.data;

  const ok = await setSetting(
    SEASONAL_LOGOS_SETTING_KEY,
    JSON.stringify(logos),
    {
      tenantId: ctx.tenantId,
      description: "Logos d'événement programmés (Octobre rose, Noël…)",
      updatedBy: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    }
  );
  if (!ok) {
    throw new AdminError(500, 'internal', 'Enregistrement impossible.');
  }
  return seasonalView(logos);
}

/* ---- Rôles d'équipe (/api/admin/site-settings/team-roles) ---- */

const ROLE_VALUE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export async function getTeamRoles(ctx: ServiceContext) {
  try {
    // Lu sur le tenant PAR DÉFAUT, comme avant la migration (l'écriture, elle,
    // est scopée au tenant du staff) — écart historique, identique en
    // mono-tenant, signalé plutôt que corrigé en passant.
    const roles = await loadTeamRolesFromSupabase(ctx.db);
    return { roles };
  } catch (err) {
    ctx.logger.error('[admin/team-roles] GET error', err);
    throw new AdminError(500, 'internal', 'Failed to load team roles.');
  }
}

export async function saveTeamRoles(ctx: ServiceContext, raw: unknown) {
  const body = raw as { roles?: unknown } | undefined;
  if (!body || !Array.isArray(body.roles)) {
    throw new ValidationError('Body must contain a roles array.');
  }

  const cleaned: TeamRole[] = [];
  const seen = new Set<string>();

  for (const item of body.roles as Array<{
    value?: unknown;
    label?: unknown;
    permissions?: unknown;
  }>) {
    const value =
      typeof item?.value === 'string' ? item.value.trim().toLowerCase() : '';
    const label =
      typeof item?.label === 'string' && item.label.trim()
        ? item.label.trim()
        : '';

    if (!value) {
      throw new ValidationError('Each role needs a value.');
    }
    if (!ROLE_VALUE_RE.test(value)) {
      throw new ValidationError(
        `Invalid role value "${value}" (use lowercase letters, digits, "-" or "_").`
      );
    }
    if (seen.has(value)) {
      throw new ValidationError(`Duplicate role value "${value}".`);
    }
    seen.add(value);

    const rawPermissions = Array.isArray(item.permissions)
      ? item.permissions
      : [];
    const permSeen = new Set<TeamPermission>();
    for (const p of rawPermissions) {
      if (!isTeamPermission(p)) {
        throw new ValidationError(
          `Invalid permission "${String(p)}" for role "${value}".`
        );
      }
      permSeen.add(p);
    }
    const permissions = TEAM_PERMISSION_VALUES.filter((p) => permSeen.has(p));

    cleaned.push({
      value,
      label: label || value.charAt(0).toUpperCase() + value.slice(1),
      permissions,
    });
  }

  if (cleaned.length === 0) {
    throw new ValidationError('At least one role required.');
  }

  // Les rôles d'équipe sont configurables PAR TENANT (lot A8) — c'est ce qui
  // débloque la délégation par équipe côté joueur (J3).
  const { error } = await repo.writeSetting(ctx.db, ctx.tenantId, {
    key: TEAM_ROLES_SETTING_KEY,
    value: serializeTeamRoles(cleaned),
    description: "Liste des rôles disponibles pour les membres d'équipe",
    updated_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
  });
  if (error) {
    ctx.logger.error('[admin/team-roles] upsert error', error);
    throw new AdminError(500, 'internal', 'Failed to save team roles.');
  }
  return { roles: cleaned };
}

/* ---- Webhooks Discord globaux ---- */

export async function listGlobalWebhooks(ctx: ServiceContext) {
  const { rows, error } = await repo.listGlobalWebhooks(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[site-settings/discord-webhooks] GET error:', error);
    throw new AdminError(500, 'internal', 'Failed to load webhooks');
  }
  return { channelTypes: DISCORD_CHANNEL_TYPES, globals: rows };
}

export async function upsertGlobalWebhook(ctx: ServiceContext, raw: unknown) {
  const { channelType, webhookUrl, roleMention, isActive } = fieldsOf(raw);

  if (!isDiscordChannelType(channelType)) {
    throw new ValidationError(INVALID_CHANNEL_TYPE_MESSAGE);
  }
  const cleanUrl = sanitizeDiscordWebhookUrl(webhookUrl);
  if (!cleanUrl) {
    throw new ValidationError(
      'webhookUrl must be a valid https://discord.com/api/webhooks/... URL'
    );
  }
  const cleanRoleMention =
    typeof roleMention === 'string' && roleMention.trim()
      ? roleMention.trim()
      : null;
  const active = isActive !== false;

  // Mise à jour d'abord (clé de l'index unique
  // `discord_webhooks_tenant_global_channel_uidx` : tenant + tournament_id
  // IS NULL + channel_type), sinon insertion.
  const existingId = await repo.findGlobalWebhookId(
    ctx.db,
    ctx.tenantId,
    channelType
  );

  let webhook: unknown;
  if (existingId) {
    const { row, error } = await repo.updateGlobalWebhook(
      ctx.db,
      ctx.tenantId,
      existingId,
      {
        webhook_url: cleanUrl,
        role_mention: cleanRoleMention,
        is_active: active,
      }
    );
    if (error) {
      ctx.logger.error('[site-settings/discord-webhooks] update error:', error);
      throw new AdminError(500, 'internal', 'Failed to update webhook');
    }
    webhook = row;
  } else {
    const { row, error } = await repo.insertGlobalWebhook(
      ctx.db,
      ctx.tenantId,
      {
        channel_type: channelType,
        webhook_url: cleanUrl,
        role_mention: cleanRoleMention,
        is_active: active,
      }
    );
    if (error) {
      ctx.logger.error('[site-settings/discord-webhooks] insert error:', error);
      throw new AdminError(500, 'internal', 'Failed to create webhook');
    }
    webhook = row;
  }

  return {
    webhook: webhook ?? null,
    channelType,
    hasRoleMention: !!cleanRoleMention,
  };
}

export async function deleteGlobalWebhook(
  ctx: ServiceContext,
  channelType: DiscordChannelType
) {
  const { error } = await repo.deleteGlobalWebhook(
    ctx.db,
    ctx.tenantId,
    channelType
  );
  if (error) {
    ctx.logger.error('[site-settings/discord-webhooks] delete error:', error);
    throw new AdminError(500, 'internal', 'Failed to delete webhook');
  }
}

/** Message de test sur le webhook global actif d'un type de salon. */
export async function testGlobalWebhook(ctx: ServiceContext, raw: unknown) {
  const { channelType } = fieldsOf(raw);
  if (!isDiscordChannelType(channelType)) {
    throw new ValidationError('Invalid channelType');
  }

  // Scopé tenant : sans ce filtre, le `maybeSingle()` casserait dès le
  // deuxième tenant (deux lignes « globales » pour le même channel_type) — et
  // pourrait poster le test dans le serveur d'à côté.
  const url = await repo.findActiveGlobalWebhookUrl(
    ctx.db,
    ctx.tenantId,
    channelType
  );
  if (!url) {
    throw new NotFoundError(
      `Aucun webhook global actif configure pour ${channelType}`
    );
  }

  await postToDiscordWebhook(url, {
    username: "OW Women's Cup — Test",
    embeds: [
      {
        title: '🧪 Test webhook (global)',
        description: `Le webhook global \`${channelType}\` fonctionne correctement.`,
        color: 0x10b981,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Configuration globale (fallback maitre)',
        },
      },
    ],
  });

  return { success: true as const };
}
