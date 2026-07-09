// pages/api/teams/scrim-plannings/[planningId]/suggest.ts
// Espace joueur/capitaine (Bearer) : suggère des créneaux « dispos habituelles »
// pour CETTE session, déduits des dernières dispos peintes par l'appelant sur
// une AUTRE session (motif weekday:minute rejoué sur la grille courante).
// GET → { slots: string[] } (peut être vide s'il n'a pas d'historique).
//
// Gates : session status='open' (sinon 409) ; l'appelant doit avoir une partie
// (team1/team2/staff), sinon 403.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { resolvePlanningParty } from '@/utils/teams/scrimPlanningParty';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import {
  availabilityPatternFromSlots,
  slotsFromPattern,
} from '@/utils/teams/scrimPlanningOverlap';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'teams-scrim-plannings-suggest'
    )
  ) {
    return;
  }

  const rawId = req.query.planningId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'planningId invalide' });
  }

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  const { data: planning, error } = await supabaseAdmin
    .from('scrim_plannings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[teams/scrim-plannings/:id/suggest] load error:', error);
    return res.status(500).json({ error: 'Failed to load scrim planning.' });
  }
  if (!planning) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }
  if (planning.status !== 'open') {
    return res.status(409).json({
      error: `Session fermée (statut : ${planning.status}).`,
      code: 'PLANNING_NOT_OPEN',
    });
  }

  const party = await resolvePlanningParty(
    userId,
    {
      team1_id: planning.team1_id as string,
      team2_id: planning.team2_id as string,
    },
    tenantId
  );
  if (!party) {
    return res
      .status(403)
      .json({ error: 'Accès non autorisé à cette session.' });
  }

  // Dernière peinture de l'appelant sur une AUTRE session (la plus récente).
  const { data: past } = await supabaseAdmin
    .from('scrim_planning_availabilities')
    .select('slots, updated_at, planning_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .neq('planning_id', id)
    .order('updated_at', { ascending: false })
    .limit(10);

  const recent = (past ?? []).find(
    (r) => Array.isArray(r.slots) && (r.slots as unknown[]).length > 0
  );
  if (!recent) {
    return res.status(200).json({ slots: [] });
  }

  const config = planningConfigFromRow(planning as never);
  const pattern = availabilityPatternFromSlots(
    recent.slots as string[],
    config.timezone
  );
  const slots = slotsFromPattern(config, pattern);

  return res.status(200).json({ slots });
});
