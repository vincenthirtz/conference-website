// pages/api/admin/tenants/[id]/discord-config/index.ts
//
// S7 : liste les configs Discord par guild pour un tenant. Pour chaque
// guild dans `discord_guilds` lie au tenant, retourne sa row dans
// `tenant_discord_config` (ou des colonnes a null si pas de row encore).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';

const EMPTY_CONFIG = {
  staff_log_channel_id: null,
  matches_live_channel_id: null,
  disputes_forum_channel_id: null,
  broadcast_panel_channel_id: null,
  news_ingest_channel_id: null,
  scrims_announce_channel_id: null,
  captain_role_id: null,
  substitute_role_id: null,
  // Roles staff par niveau (depuis migration drop staff_role_ids).
  staff_role_owner_id: null,
  staff_role_admin_id: null,
  staff_role_caster_id: null,
  teams_voice_category_id: null,
  disputes_forum_tag_open_id: null,
  disputes_forum_tag_pending_id: null,
  disputes_forum_tag_resolved_id: null,
  // Accueil des nouveaux arrivants (par guild).
  welcome_enabled: false,
  welcome_channel_id: null,
  welcome_message: null,
  welcome_dm_message: null,
  // Départs des membres (« chan des partants »).
  member_leave_channel_id: null,
  extras: {} as Record<string, unknown>,
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-tenants-discord-config'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tenant id.' });
  }

  // Acces : manager+ requis pour LIRE la config Discord (channels/roles).
  // Les casters n'y ont pas acces meme s'ils sont rattaches au tenant via
  // tenant_staff. Les pole admins beneficient d'un bypass cross-tenant.
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const isPoleAdmin =
    (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
  const allowed = await canAccessTenant(ctx.staff.id, id, { isPoleAdmin });
  if (!allowed) {
    return res.status(403).json({ error: 'No access to this tenant.' });
  }

  const { data: guilds, error: gErr } = await supabaseAdmin
    .from('discord_guilds')
    .select('guild_id, is_primary')
    .eq('tenant_id', id);

  if (gErr) {
    logger.error('[admin/tenants/[id]/discord-config] list guilds error', gErr);
    return res.status(500).json({ error: 'Failed to load guilds.' });
  }

  const guildList = (guilds ?? []) as Array<{
    guild_id: string;
    is_primary: boolean;
  }>;
  const guildIds = guildList.map((g) => g.guild_id);

  let configs: Array<Record<string, unknown>> = [];
  if (guildIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('tenant_discord_config')
      .select('*')
      .in('guild_id', guildIds);
    if (error) {
      logger.error(
        '[admin/tenants/[id]/discord-config] list config error',
        error
      );
      return res.status(500).json({ error: 'Failed to load configs.' });
    }
    configs = (data ?? []) as Array<Record<string, unknown>>;
  }

  const byGuild = new Map<string, Record<string, unknown>>();
  for (const c of configs) byGuild.set(c.guild_id as string, c);

  const merged = guildList.map((g) => {
    const existing = byGuild.get(g.guild_id);
    if (existing) {
      return { ...existing, is_primary: g.is_primary };
    }
    return { guild_id: g.guild_id, is_primary: g.is_primary, ...EMPTY_CONFIG };
  });

  return res.status(200).json({ configs: merged });
}

export default withStaffRoute(handler, { permission: 'manage_settings' });
