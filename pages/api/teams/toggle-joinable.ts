// pages/api/teams/toggle-joinable.ts
// POST : le capitaine active/desactive le recrutement ouvert de son equipe

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'toggle-joinable')
  )
    return;

  const userId = user.id;

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeam(userId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, is_joinable')
    .eq('id', access.teamId)
    .maybeSingle();

  if (teamErr || !team) {
    return res.status(404).json({ error: 'Team introuvable.' });
  }

  const { joinable } = req.body || {};
  const newValue = typeof joinable === 'boolean' ? joinable : !team.is_joinable;

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({ is_joinable: newValue })
    .eq('id', team.id);

  if (updateErr) {
    logger.error('[toggle-joinable] update error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour.' });
  }

  return res.status(200).json({
    success: true,
    teamId: team.id,
    is_joinable: newValue,
    message: newValue
      ? 'Ton equipe est maintenant ouverte aux demandes de joueurs.'
      : 'Ton equipe est fermee aux nouvelles demandes.',
  });
});
