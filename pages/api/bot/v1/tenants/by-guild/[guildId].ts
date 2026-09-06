// GET /api/bot/v1/tenants/by-guild/[guildId]
//
// Resoud un guild Discord -> tenant + config Discord. C'est l'endpoint
// principal qu'utilise le bot pour mapper dynamiquement `interaction.guildId`
// vers (tenant_id, channels, roles, forum tags) au lieu de lire des env vars
// hardcodees.
//
// EXCEPTION DE SCOPING TENANT_ID : cet endpoint EST le resolveur de tenant.
// Il ne peut donc pas filtrer ses queries par `req.botContext.tenantId` (qui
// pointe sur le DEFAULT_TENANT_ID si le bot n'envoie pas encore le header).
// Il interroge directement `discord_guilds` par PK puis hydrate la config.
//
// Auth: x-api-key valide contre BOT_API_KEY. Pas de actorDiscordUserId requis
// (lookup pur, pas d'audit).
//
// Cas non-trouve : 404 avec code `GUILD_NOT_LINKED` (signal au bot qu'il faut
// declencher le flow `POST /tenants/link-guild`).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

// Forme stable de la config Discord renvoyee. Si la row
// `tenant_discord_config` n'existe pas pour un guild liee, on renvoie quand
// meme l'objet avec toutes les colonnes a null/[]/{} pour que le bot ait un
// contrat homogene (et puisse appliquer son fallback env sur les NULL).
function emptyDiscordConfig() {
  return {
    staff_log_channel_id: null as string | null,
    matches_live_channel_id: null as string | null,
    disputes_forum_channel_id: null as string | null,
    news_ingest_channel_id: null as string | null,
    scrims_announce_channel_id: null as string | null,
    captain_role_id: null as string | null,
    substitute_role_id: null as string | null,
    // Roles staff par niveau (depuis migration drop staff_role_ids).
    staff_role_owner_id: null as string | null,
    staff_role_admin_id: null as string | null,
    placement_roles: null as unknown,
    staff_role_caster_id: null as string | null,
    teams_voice_category_id: null as string | null,
    disputes_forum_tag_open_id: null as string | null,
    disputes_forum_tag_pending_id: null as string | null,
    disputes_forum_tag_resolved_id: null as string | null,
    extras: {} as Record<string, unknown>,
  };
}

// Discord snowflakes : 17-20 chiffres en pratique, mais on reste tolerant
// (15-25) comme dans utils/botAuth.ts pour rester coherent.
const GUILD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  const raw = req.query.guildId;
  const guildId = Array.isArray(raw) ? raw[0] : raw;

  if (!guildId || typeof guildId !== 'string' || !GUILD_ID_RE.test(guildId)) {
    return res.status(400).json({
      error: 'guildId invalide (snowflake Discord requis)',
      code: 'INVALID_GUILD_ID',
    });
  }

  // 1) Lookup discord_guilds + tenant en une seule requete (embed).
  // Un bot auto-hébergé ne résout que SES serveurs : sur un guild d'un autre
  // tenant, la réponse est « non enregistré » (404 plus bas), jamais sa config.
  let guildQuery = supabaseAdmin!
    .from('discord_guilds')
    .select(
      'guild_id, is_primary, tenant:tenants!discord_guilds_tenant_id_fkey(id, slug, name, is_active, default_locale)'
    )
    .eq('guild_id', guildId);
  if (!req.botKey.isPlatformKey) {
    guildQuery = guildQuery.eq('tenant_id', req.botKey.tenantId);
  }
  const { data: guildRow, error: guildErr } = await guildQuery.maybeSingle();

  if (guildErr) {
    logger.error('[bot/tenants/by-guild] guild lookup error', guildErr);
    return res.status(500).json({ error: 'Failed to resolve guild' });
  }

  if (!guildRow || !guildRow.tenant) {
    return res.status(404).json({
      error: 'Guild non enregistre',
      code: 'GUILD_NOT_LINKED',
      guild_id: guildId,
    });
  }

  // 2) Hydrate la config Discord (NULL safe — si pas de row, on retourne les
  // defauts vides du contrat).
  const { data: configRow, error: configErr } = await supabaseAdmin!
    .from('tenant_discord_config')
    .select(
      'staff_log_channel_id, matches_live_channel_id, disputes_forum_channel_id, news_ingest_channel_id, scrims_announce_channel_id, captain_role_id, substitute_role_id, staff_role_owner_id, staff_role_admin_id, staff_role_caster_id, teams_voice_category_id, disputes_forum_tag_open_id, disputes_forum_tag_pending_id, disputes_forum_tag_resolved_id, extras, placement_roles'
    )
    .eq('guild_id', guildId)
    .maybeSingle();

  if (configErr) {
    logger.error('[bot/tenants/by-guild] config lookup error', configErr);
    return res.status(500).json({ error: 'Failed to load discord_config' });
  }

  const discord_config = configRow
    ? {
        ...emptyDiscordConfig(),
        ...configRow,
        extras:
          configRow.extras && typeof configRow.extras === 'object'
            ? (configRow.extras as Record<string, unknown>)
            : {},
      }
    : emptyDiscordConfig();

  // Supabase embed renvoie un objet OU un tableau selon la cardinalite
  // detectee — on normalise.
  const tenant = Array.isArray(guildRow.tenant)
    ? guildRow.tenant[0]
    : guildRow.tenant;

  return res.status(200).json({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      is_active: tenant.is_active,
      default_locale: tenant.default_locale,
    },
    guild: {
      guild_id: guildRow.guild_id,
      is_primary: guildRow.is_primary,
    },
    discord_config,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 120, key: 'bot-tenants-by-guild' },
  crossTenant: true,
});
