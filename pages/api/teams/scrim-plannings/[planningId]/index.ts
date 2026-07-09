// pages/api/teams/scrim-plannings/[planningId]/index.ts
// Espace joueur/capitaine (Bearer auth) : détail d'une session de planning.
// - GET : renvoie la session, la partie de l'appelant (403 s'il n'en a aucune),
//   ses propres slots, et une heatmap AGRÉGÉE MAIS ANONYMISÉE.
//
// IMPORTANT (fuite d'info) : contrairement à la route admin, la heatmap joueur
// NE DOIT PAS exposer l'attribution nominative (display_name / userId) — sinon
// une équipe verrait qui, en face, a peint quel créneau. On ne renvoie que
// { count, parties } par slot.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { resolvePlanningParty } from '@/utils/teams/scrimPlanningParty';
import {
  buildHeatmap,
  type PlanningAvailabilityInput,
  type PlanningParty,
} from '@/utils/teams/scrimPlanningOverlap';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

/** Heatmap sans attribution nominative — sûre à renvoyer côté joueur. */
type AnonHeatmap = Record<string, { count: number; parties: PlanningParty[] }>;

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
      'teams-scrim-plannings-detail'
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
    logger.error('[teams/scrim-plannings/:id] GET error:', error);
    return res.status(500).json({ error: 'Failed to load scrim planning.' });
  }
  if (!planning) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  const myParty = await resolvePlanningParty(
    userId,
    {
      team1_id: planning.team1_id as string,
      team2_id: planning.team2_id as string,
    },
    tenantId
  );
  if (!myParty) {
    return res
      .status(403)
      .json({ error: 'Accès non autorisé à cette session.' });
  }

  const { data: availabilities } = await supabaseAdmin
    .from('scrim_planning_availabilities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('planning_id', id);

  const rows = availabilities ?? [];
  const heatmapInput: PlanningAvailabilityInput[] = rows.map((r) => ({
    party: r.party as PlanningParty,
    userId: r.user_id as string,
    displayName: (r.display_name as string | null) ?? null,
    slots: Array.isArray(r.slots) ? (r.slots as string[]) : [],
  }));

  // Anonymise : on jette `participants` avant de renvoyer.
  const fullHeatmap = buildHeatmap(heatmapInput);
  const heatmap: AnonHeatmap = {};
  for (const [key, cell] of Object.entries(fullHeatmap)) {
    heatmap[key] = { count: cell.count, parties: cell.parties };
  }

  const mine = rows.find((r) => r.user_id === userId);
  const mySlots =
    mine && Array.isArray(mine.slots) ? (mine.slots as string[]) : [];

  return res.status(200).json({ planning, myParty, mySlots, heatmap });
});
