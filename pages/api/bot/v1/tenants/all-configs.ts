// GET /api/bot/v1/tenants/all-configs
//
// Retourne la config de tous les guilds linkes en une seule requete. Utilise
// par le bot au boot pour amorcer son cache in-memory `guildId -> {tenant,
// config}` plutot que de faire N requetes /by-guild/:id.
//
// SCOPING : la réponse dépend de QUI appelle (`req.botKey`).
//   - clé du bot MUTUALISÉ (`is_platform_key`) : tous les guilds liés. Ce bot
//     sert plusieurs serveurs, il lui faut la table de routage complète.
//   - clé d'un tenant (bot auto-hébergé) : uniquement SES guilds. Sans ce
//     filtre, n'importe quelle clé valide lisait la configuration Discord de
//     tous les tenants — salons, rôles, catégories.
//
// Auth: x-api-key. Pas de pagination V1 (peu de guilds attendus, < 100). Si
// le volume monte, ajouter `?limit=&offset=` ici.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

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
    // Accueil des nouveaux arrivants (par guild).
    welcome_enabled: false as boolean,
    welcome_channel_id: null as string | null,
    welcome_message: null as string | null,
    welcome_dm_message: null as string | null,
    // Départs des membres (« chan des partants »).
    member_leave_channel_id: null as string | null,
    extras: {} as Record<string, unknown>,
  };
}

type DiscordConfigRow = ReturnType<typeof emptyDiscordConfig> & {
  guild_id: string;
};

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  // 1) Guilds visibles par l'appelant, avec leur tenant.
  let guildQuery = supabaseAdmin!
    .from('discord_guilds')
    .select(
      'guild_id, is_primary, tenant:tenants!discord_guilds_tenant_id_fkey(id, slug, name, is_active, default_locale)'
    )
    .order('guild_id', { ascending: true });
  if (!req.botKey.isPlatformKey) {
    guildQuery = guildQuery.eq('tenant_id', req.botKey.tenantId);
  }
  const { data: guildRows, error: guildErr } = await guildQuery;

  if (guildErr) {
    logger.error('[bot/tenants/all-configs] guild list error', guildErr);
    return res.status(500).json({ error: 'Failed to list guilds' });
  }

  const guilds = guildRows ?? [];
  if (guilds.length === 0) {
    return res.status(200).json({ configs: [] });
  }

  // 2) Toutes les configs en un seul SELECT, indexees par guild_id.
  const guildIds = guilds.map((g) => g.guild_id as string);
  const { data: configRows, error: configErr } = await supabaseAdmin!
    .from('tenant_discord_config')
    .select(
      'guild_id, staff_log_channel_id, matches_live_channel_id, disputes_forum_channel_id, news_ingest_channel_id, scrims_announce_channel_id, captain_role_id, substitute_role_id, staff_role_owner_id, staff_role_admin_id, staff_role_caster_id, teams_voice_category_id, disputes_forum_tag_open_id, disputes_forum_tag_pending_id, disputes_forum_tag_resolved_id, welcome_enabled, welcome_channel_id, welcome_message, welcome_dm_message, member_leave_channel_id, extras, placement_roles'
    )
    .in('guild_id', guildIds);

  if (configErr) {
    logger.error('[bot/tenants/all-configs] config list error', configErr);
    return res.status(500).json({ error: 'Failed to list discord configs' });
  }

  const configByGuild = new Map<string, DiscordConfigRow>();
  for (const row of configRows ?? []) {
    const r = row as Record<string, unknown>;
    const guildId = r.guild_id as string;
    configByGuild.set(guildId, {
      ...emptyDiscordConfig(),
      ...(r as object),
      guild_id: guildId,
      extras:
        r.extras && typeof r.extras === 'object'
          ? (r.extras as Record<string, unknown>)
          : {},
    } as DiscordConfigRow);
  }

  const configs = guilds
    .filter((g) => Boolean(g.tenant))
    .map((g) => {
      const tenant = Array.isArray(g.tenant) ? g.tenant[0] : g.tenant;
      const cfg = configByGuild.get(g.guild_id as string);
      // On enleve `guild_id` du config object (redondant avec guild.guild_id).
      let discord_config: ReturnType<typeof emptyDiscordConfig>;
      if (cfg) {
        const { guild_id: _gid, ...rest } = cfg;
        void _gid;
        discord_config = rest;
      } else {
        discord_config = emptyDiscordConfig();
      }
      return {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          is_active: tenant.is_active,
          default_locale: tenant.default_locale,
        },
        guild: {
          guild_id: g.guild_id,
          is_primary: g.is_primary,
        },
        discord_config,
      };
    });

  return res.status(200).json({ configs });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-tenants-all-configs' },
  crossTenant: true,
});
