// pages/api/admin/lobbies/[lobbyId].ts
// Admin: suppression d'un lobby FFA.
// - DELETE : supprime le lobby (la cascade DB retire ses lobby_placements).
//
// FFA est isolé du moteur match team-vs-team. Rien ici ne touche `matches`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../utils/logger';

type ApiResponse = { success: true } | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { lobbyId } = req.query;

  if (!lobbyId || Array.isArray(lobbyId) || !isValidUUID(lobbyId)) {
    return res.status(400).json({ error: 'Invalid lobbyId' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data: lobby, error: lobbyErr } = await supabaseAdmin
      .from('lobbies')
      .select('id, tournament_id, stage_id')
      .eq('id', String(lobbyId))
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (lobbyErr || !lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    // Best-effort: retire explicitement les placements au cas où la cascade
    // ne serait pas active côté DB.
    await supabaseAdmin
      .from('lobby_placements')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('lobby_id', String(lobbyId));

    const { error: delErr } = await supabaseAdmin
      .from('lobbies')
      .delete()
      .eq('id', String(lobbyId))
      .eq('tenant_id', ctx.tenantId);

    if (delErr) {
      logger.error('DELETE lobby error:', delErr);
      return res.status(500).json({ error: 'Failed to delete lobby' });
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_stage',
        entity_type: 'lobby',
        entity_id: String(lobbyId),
        tournament_id: lobby.tournament_id,
        payload: { action: 'delete_lobby', stageId: lobby.stage_id },
      });
    }

    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    logger.error('[/api/admin/lobbies/[lobbyId]] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
