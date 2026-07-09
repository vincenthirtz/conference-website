// pages/api/teams/scrim-plannings/index.ts
// Espace joueur/capitaine (Bearer auth) : liste les sessions de planning de
// scrim OUVERTES visibles par l'appelant (= il gère team1 ou team2, OU il est
// staff). Pour chacune, expose sa propre partie (myParty) et ses propres slots
// déjà peints (myAvailability). Aucune fuite d'attribution cross-équipe ici :
// on ne renvoie QUE les dispos de l'appelant.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { getStaffRole } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import type { ScrimPlanningSummary } from '@/types/admin';
import type { PlanningParty } from '@/utils/teams/scrimPlanningOverlap';
import { logger } from '@/utils/logger';

const SUMMARY_COLUMNS =
  'id, title, game, status, team1_id, team2_id, horizon_start, horizon_days, validated_slot, scrim_id';

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
      'teams-scrim-plannings'
    )
  ) {
    return;
  }

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  const managed = await getManagedTeam(userId, tenantId);
  const staffRole = await getStaffRole(userId);

  if (!managed && !staffRole) {
    // Aucun droit → liste vide plutôt qu'un 403 (endpoint de listing).
    return res.status(200).json({ plannings: [] });
  }

  const { data: plannings, error } = await supabaseAdmin
    .from('scrim_plannings')
    .select(SUMMARY_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[teams/scrim-plannings] GET error:', error);
    return res.status(500).json({ error: 'Failed to load scrim plannings.' });
  }

  const rows = (plannings ?? []) as unknown as ScrimPlanningSummary[];

  // Visibilité : staff voit tout, sinon uniquement les sessions où le user gère
  // team1 ou team2.
  const visible = rows.filter((p) => {
    if (staffRole) return true;
    return managed?.teamId === p.team1_id || managed?.teamId === p.team2_id;
  });

  // Charge en un seul appel les dispos de l'appelant sur les sessions visibles.
  const visibleIds = visible.map((p) => p.id);
  const myAvailByPlanning = new Map<string, string[]>();
  if (visibleIds.length > 0) {
    const { data: myRows } = await supabaseAdmin
      .from('scrim_planning_availabilities')
      .select('planning_id, slots')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .in('planning_id', visibleIds);
    for (const r of myRows ?? []) {
      myAvailByPlanning.set(
        r.planning_id as string,
        Array.isArray(r.slots) ? (r.slots as string[]) : []
      );
    }
  }

  const out = visible.map((planning) => {
    let myParty: PlanningParty | null = null;
    if (managed?.teamId === planning.team1_id) myParty = 'team1';
    else if (managed?.teamId === planning.team2_id) myParty = 'team2';
    else if (staffRole) myParty = 'staff';

    return {
      planning,
      myParty,
      myAvailability: myAvailByPlanning.get(planning.id) ?? [],
    };
  });

  return res.status(200).json({ plannings: out });
});
