// pages/api/teams/scrim-plannings/[planningId]/availability.ts
// Espace joueur/capitaine (Bearer auth) : peint / met à jour SES créneaux de
// disponibilité sur une session de planning.
// - PUT : remplace intégralement la liste de slots de l'appelant (UPSERT sur
//   la clé UNIQUE (planning_id, user_id)). Une liste vide efface sa peinture.
//
// Gates : session status='open' (sinon 409) ; l'appelant doit avoir une partie
// (team1/team2/staff), sinon 403. Les slots sont validés contre la grille de la
// session via normalizePlanningSlots (400 si hors grille).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { resolvePlanningParty } from '@/utils/teams/scrimPlanningParty';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import { normalizePlanningSlots } from '@/utils/teams/scrimPlanningOverlap';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'teams-scrim-plannings-availability'
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
    logger.error('[teams/scrim-plannings/:id/availability] load error:', error);
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

  const config = planningConfigFromRow(planning as never);
  const result = normalizePlanningSlots((req.body ?? {}).slots, config);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  const slots = result.slots;

  // Résout un display_name pour l'affichage hover admin : d'abord team_members
  // (nom d'équipe), sinon les metadata Supabase du user.
  const displayName = await resolveDisplayName(userId, tenantId, user);

  const { error: upsertErr } = await supabaseAdmin
    .from('scrim_planning_availabilities')
    .upsert(
      {
        tenant_id: tenantId,
        planning_id: id,
        party,
        user_id: userId,
        display_name: displayName,
        slots,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'planning_id,user_id' }
    );

  if (upsertErr) {
    logger.error(
      '[teams/scrim-plannings/:id/availability] upsert error:',
      upsertErr
    );
    return res.status(500).json({ error: 'Failed to save availability.' });
  }

  return res.status(200).json({ success: true, mySlots: slots });
});

async function resolveDisplayName(
  userId: string,
  tenantId: string,
  user: { user_metadata?: Record<string, unknown> }
): Promise<string | null> {
  try {
    const { data: member } = await supabaseAdmin
      .from('team_members')
      .select('display_name')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    const fromMember = (member?.display_name as string | null) ?? null;
    if (fromMember) return fromMember;
  } catch (e) {
    logger.error('[teams/scrim-plannings/availability] display_name lookup', e);
  }
  const meta = user.user_metadata ?? {};
  return (
    (meta.display_name as string | null) ||
    (meta.full_name as string | null) ||
    null
  );
}
