// pages/api/admin/tenants/[id]/discord-config/[guildId].ts
//
// S7 : PUT upsert d'une config Discord par guild.
//
// Verifications :
//   - tenant id valide,
//   - acces tenant (manager+ OU staff du tenant),
//   - le guildId fait partie des guilds du tenant (via `discord_guilds`),
//   - tous les IDs (channel/role/tag) sont des snowflakes 15-25 digits OU
//     NULL, `staff_role_ids` est un text[] de snowflakes.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';

const SNOWFLAKE_RE = /^[0-9]{15,25}$/;
const GUILD_ID_RE = /^[0-9]{15,25}$/;

const NULLABLE_SNOWFLAKE_KEYS = [
  'staff_log_channel_id',
  'matches_live_channel_id',
  'disputes_forum_channel_id',
  'lives_board_channel_id',
  'news_ingest_channel_id',
  'scrims_announce_channel_id',
  'captain_role_id',
  'substitute_role_id',
  'teams_voice_category_id',
  'disputes_forum_tag_open_id',
  'disputes_forum_tag_pending_id',
  'disputes_forum_tag_resolved_id',
] as const;

type NullableSnowflakeKey = (typeof NULLABLE_SNOWFLAKE_KEYS)[number];

function validateNullableSnowflake(
  value: unknown
): { ok: true } | { ok: false } {
  if (value === null) return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  if (value === '') return { ok: true }; // treat empty string as null at validation time
  return SNOWFLAKE_RE.test(value) ? { ok: true } : { ok: false };
}

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
      'admin-tenants-discord-config-put'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, guildId } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tenant id.' });
  }
  if (!guildId || typeof guildId !== 'string' || !GUILD_ID_RE.test(guildId)) {
    return res
      .status(400)
      .json({ error: 'Invalid guildId.', code: 'INVALID_GUILD_ID' });
  }

  // Acces : manager+ OU staff du tenant.
  if (!hasAtLeastRole(ctx.role, 'manager')) {
    const allowed = await canAccessTenant(ctx.staff.id, id);
    if (!allowed) {
      return res.status(403).json({ error: 'No access to this tenant.' });
    }
  }

  // Verifie que le guild appartient bien au tenant.
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('discord_guilds')
    .select('guild_id, tenant_id')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (linkErr) {
    logger.error(
      '[admin/tenants/[id]/discord-config/[guildId]] link lookup error',
      linkErr
    );
    return res.status(500).json({ error: 'Failed to verify guild link.' });
  }
  if (!link || link.tenant_id !== id) {
    return res
      .status(404)
      .json({
        error: 'Guild not linked to this tenant.',
        code: 'GUILD_NOT_IN_TENANT',
      });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const upsertPayload: Record<string, unknown> = { guild_id: guildId };

  for (const key of NULLABLE_SNOWFLAKE_KEYS) {
    if (!(key in body)) continue;
    const v = (body as Record<string, unknown>)[key as NullableSnowflakeKey];
    const validation = validateNullableSnowflake(v);
    if (!validation.ok) {
      return res.status(400).json({
        error: `${key} must be a snowflake (15-25 digits) or null.`,
        code: 'INVALID_SNOWFLAKE',
        field: key,
      });
    }
    upsertPayload[key] = typeof v === 'string' && v === '' ? null : v;
  }

  if ('staff_role_ids' in body) {
    const raw = (body as Record<string, unknown>).staff_role_ids;
    if (!Array.isArray(raw)) {
      return res
        .status(400)
        .json({
          error: 'staff_role_ids must be an array.',
          code: 'INVALID_STAFF_ROLES',
        });
    }
    for (const role of raw) {
      if (typeof role !== 'string' || !SNOWFLAKE_RE.test(role)) {
        return res
          .status(400)
          .json({
            error: 'staff_role_ids entries must be snowflakes.',
            code: 'INVALID_STAFF_ROLES',
          });
      }
    }
    upsertPayload.staff_role_ids = raw;
  }

  if ('extras' in body) {
    const e = (body as Record<string, unknown>).extras;
    if (e !== null && (typeof e !== 'object' || Array.isArray(e))) {
      return res
        .status(400)
        .json({ error: 'extras must be an object.', code: 'INVALID_EXTRAS' });
    }
    upsertPayload.extras = e ?? {};
  }

  const { error } = await supabaseAdmin
    .from('tenant_discord_config')
    .upsert(upsertPayload, { onConflict: 'guild_id' });

  if (error) {
    logger.error(
      '[admin/tenants/[id]/discord-config/[guildId]] upsert error',
      error
    );
    return res.status(500).json({ error: 'Failed to save config.' });
  }

  // Re-read pour renvoyer la row complete (post-trigger updated_at).
  const { data: config, error: readErr } = await supabaseAdmin
    .from('tenant_discord_config')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (readErr) {
    logger.error(
      '[admin/tenants/[id]/discord-config/[guildId]] read error',
      readErr
    );
    return res.status(500).json({ error: 'Failed to read config.' });
  }

  return res.status(200).json({ config: config ?? upsertPayload });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenants-discord-config-put' }),
  'caster'
);
