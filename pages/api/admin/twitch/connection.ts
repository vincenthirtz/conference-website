// /api/admin/twitch/connection
//
// GET    (staff, caster+)  → statut de la connexion broadcaster du tenant.
//                            NE RENVOIE JAMAIS les tokens (ni chiffrés).
// DELETE (staff, manager+) → déconnecte la chaîne (supprime la row).
//
// La route est montée à 'caster' pour que le cockpit régie puisse afficher le
// statut ; le DELETE est re-gaté à 'manager' dans le handler.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const TABLE = 'twitch_broadcaster_connections';

async function getHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'twitch-conn-get')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('broadcaster_login, scope, expires_at')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[admin/twitch/connection] lookup error', error);
    return res.status(500).json({ error: 'Failed to load connection.' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  if (!data) {
    return res.status(200).json({ connected: false });
  }
  return res.status(200).json({
    connected: true,
    broadcaster_login: data.broadcaster_login,
    scope: data.scope ?? [],
    expires_at: data.expires_at,
  });
}

async function deleteHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'twitch-conn-del')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('[admin/twitch/connection] delete error', error);
    return res.status(500).json({ error: 'Failed to disconnect.' });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'twitch_broadcaster_connection',
      entity_id: ctx.tenantId,
      tenant_id: ctx.tenantId,
      payload: { action: 'disconnect_twitch_broadcaster' },
    });
  }

  return res.status(200).json({ connected: false });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'GET') return getHandler(req, res, ctx);
  if (req.method === 'DELETE') return deleteHandler(req, res, ctx);
  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'caster');
