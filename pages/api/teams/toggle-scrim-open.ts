// pages/api/teams/toggle-scrim-open.ts
// POST : le capitaine déclare son équipe ouverte / fermée aux scrims (opt-in
// public affiché sur /scrim). Miroir de toggle-joinable.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';

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
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'toggle-scrim-open')
  )
    return;

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  // Permission fine (R2) : le rôle doit couvrir `manage_scrims` — un rôle
  // à privilèges partiels n'ouvre plus l'ensemble de la gestion d'équipe.
  const denied = assertTeamPermission(access, 'manage_scrims');
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, open_for_scrim')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr || !team) {
    return res.status(404).json({ error: 'Team introuvable.' });
  }

  const { open } = req.body || {};
  const newValue = typeof open === 'boolean' ? open : !team.open_for_scrim;

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update({ open_for_scrim: newValue })
    .eq('id', team.id)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[toggle-scrim-open] update error:', updateErr);
    return res.status(500).json({ error: 'Echec de la mise a jour.' });
  }

  return res.status(200).json({
    success: true,
    teamId: team.id,
    open_for_scrim: newValue,
    message: newValue
      ? 'Ton équipe est maintenant ouverte aux scrims (visible sur la page publique).'
      : 'Ton équipe n’est plus affichée comme ouverte aux scrims.',
  });
});
