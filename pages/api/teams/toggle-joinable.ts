// pages/api/teams/toggle-joinable.ts
// POST : le capitaine active/desactive le recrutement ouvert de son equipe

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';

import { logger } from '../../../utils/logger';
export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
  ) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (
      applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'toggle-joinable')
    )
      return;

    // Sujet = l'appelant, ou le membre inspecté quand le staff agit à sa place
    // (`?as=…&act=1`, cf. utils/subject.ts). L'accès est donc résolu sur l'équipe
    // du SUJET : c'est tout l'intérêt — dépanner une capitaine bloquée.
    const { userId, tenantId } = subject;

    // Check if user can manage a team (captain or manager)
    const access = await getManagedTeam(userId, tenantId);
    if (!access) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }

    // Permission fine (R2) : le rôle doit couvrir `manage_join_requests` — un rôle
    // à privilèges partiels n'ouvre plus l'ensemble de la gestion d'équipe.
    const denied = assertTeamPermission(access, 'manage_join_requests');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, is_joinable')
      .eq('id', access.teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !team) {
      return res.status(404).json({ error: 'Team introuvable.' });
    }

    const { joinable } = req.body || {};
    const newValue =
      typeof joinable === 'boolean' ? joinable : !team.is_joinable;

    const { error: updateErr } = await supabaseAdmin
      .from('teams')
      .update({ is_joinable: newValue })
      .eq('id', team.id)
      .eq('tenant_id', tenantId);

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
  },
  { tenantResolution: 'async', allowActAs: true }
);
