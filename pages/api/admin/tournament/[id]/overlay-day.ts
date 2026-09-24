// pages/api/admin/tournament/[id]/overlay-day.ts
//
// Le jour FORCÉ de la source OBS « Matchs du jour » d'un tournoi.
//
//   GET → { date, setAt, expiresAt, active }
//   PUT { date: 'AAAA-MM-JJ' | null } → pose (ou retire) le jour forcé
//
// La source déjà collée dans OBS (`/overlay/day?tournament=…`, sans date) le
// suit à son prochain rafraîchissement ; il expire seul au bout de 12 h
// (utils/overlay/dayOverride.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  activeDayOverride,
  dayOverrideExpiresAt,
  isDayString,
} from '@/utils/overlay/dayOverride';

export default withStaffRoute(handler, { permission: 'manage_tournaments' });

type Row = {
  id: string;
  overlay_day_date: string | null;
  overlay_day_set_at: string | null;
};

function view(row: Row) {
  return {
    date: row.overlay_day_date,
    setAt: row.overlay_day_set_at,
    expiresAt: dayOverrideExpiresAt(row.overlay_day_set_at),
    active: activeDayOverride(row, Date.now()) !== null,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }
  if (req.method === 'GET') return handleGet(id, res, ctx);
  if (req.method === 'PUT') return handlePut(id, req, res, ctx);
  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(
  id: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id, overlay_day_date, overlay_day_set_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[admin/overlay-day] read error:', error);
    return res.status(500).json({ error: 'Lecture impossible' });
  }
  if (!data) return res.status(404).json({ error: 'Tournament not found' });
  return res.status(200).json(view(data as Row));
}

async function handlePut(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const raw = (req.body ?? {}) as { date?: unknown };
  const date = raw.date === null || raw.date === '' ? null : raw.date;
  if (date !== null && !isDayString(date)) {
    return res
      .status(400)
      .json({ error: 'date invalide (format AAAA-MM-JJ, ou null)' });
  }

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .update({
      overlay_day_date: date,
      overlay_day_set_at: date ? new Date().toISOString() : null,
    })
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .select('id, overlay_day_date, overlay_day_set_at')
    .maybeSingle();
  if (error) {
    logger.error('[admin/overlay-day] write error:', error);
    return res.status(500).json({ error: 'Enregistrement impossible' });
  }
  if (!data) return res.status(404).json({ error: 'Tournament not found' });

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_tournament',
      entity_type: 'tournament',
      entity_id: id,
      tournament_id: id,
      tenant_id: ctx.tenantId,
      payload: { overlay_day_date: date },
    });
  }

  return res.status(200).json(view(data as Row));
}
