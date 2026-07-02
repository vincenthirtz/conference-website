// pages/api/admin/leagues/[id]/tournaments/index.ts
// POST → lie un tournoi à une league (avec un poids optionnel).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const linkSchema = z.object({
  tournament_id: z.string().uuid(),
  weight: z.number().positive().optional(),
});

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
      'admin-leagues-tournaments'
    )
  )
    return;

  const rawId = req.query.id;
  const leagueId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!leagueId || !isValidUUID(leagueId)) {
    return res.status(400).json({ error: 'Missing or invalid league id' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body',
      code: 'INVALID_BODY',
      details: parsed.error.flatten(),
    });
  }
  const { tournament_id, weight } = parsed.data;

  // League appartient au tenant.
  const { data: league } = await supabaseAdmin
    .from('leagues')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', leagueId)
    .maybeSingle();
  if (!league) return res.status(404).json({ error: 'League not found' });

  // Tournoi appartient au tenant.
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', tournament_id)
    .maybeSingle();
  if (!tournament) {
    return res
      .status(404)
      .json({ error: 'Tournament not found', code: 'TOURNAMENT_NOT_FOUND' });
  }

  const { data, error } = await supabaseAdmin
    .from('league_tournaments')
    .upsert(
      {
        league_id: leagueId,
        tournament_id,
        tenant_id: ctx.tenantId,
        weight: weight ?? 1,
      },
      { onConflict: 'league_id,tournament_id' }
    )
    .select('*')
    .maybeSingle();
  if (error) {
    logger.error('[admin/leagues/tournaments] link error', error);
    return res.status(500).json({ error: 'Failed to link tournament' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'league',
    entity_id: leagueId,
    tenant_id: ctx.tenantId,
    payload: {
      operation: 'link_tournament',
      tournament_id,
      weight: weight ?? 1,
    },
  });

  return res.status(201).json(
    data ?? {
      league_id: leagueId,
      tournament_id,
      tenant_id: ctx.tenantId,
      weight: weight ?? 1,
    }
  );
}

export default withStaffRoute(handler, 'manager');
