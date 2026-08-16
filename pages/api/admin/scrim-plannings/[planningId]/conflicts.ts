// pages/api/admin/scrim-plannings/[planningId]/conflicts.ts
// Admin (staff manager) — PRÉVISUALISATION des conflits de créneau AVANT
// validation. Pour une liste de créneaux candidats, renvoie, par créneau, les
// scrims/matches qui le chevauchent (± fenêtre) pour l'une des deux équipes.
//
// Réutilise EXACTEMENT `findScrimConflicts` (la même fonction que le 409
// SLOT_CONFLICT de validate.ts) → aucune divergence entre l'aperçu affiché et
// le blocage réel. Lecture seule, pas d'idempotence.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  findScrimConflicts,
  type SlotConflict,
} from '@/utils/teams/scrimConflicts';
import { logger } from '@/utils/logger';

// Borne le nombre de créneaux à prévisualiser (2 requêtes DB / créneau).
const MAX_SLOTS = 16;

const bodySchema = z.object({
  slots: z.array(z.string().trim().min(1)).max(MAX_SLOTS),
});

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawId = req.query.planningId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'planningId invalide' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Requête invalide.' });
  }

  // Charge la planning pour récupérer les deux équipes (et vérifier le tenant).
  const { data: planning, error: planErr } = await supabaseAdmin
    .from('scrim_plannings')
    .select('team1_id, team2_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (planErr) {
    logger.error('[admin/scrim-plannings/conflicts] load error:', planErr);
    return res.status(500).json({ error: 'Failed to load scrim planning' });
  }
  if (!planning) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  // Dédupe + canonicalise les créneaux (ISO), ignore les dates invalides.
  const seen = new Set<string>();
  for (const raw of parsed.data.slots) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) seen.add(d.toISOString());
  }

  const teamIds = [planning.team1_id as string, planning.team2_id as string];

  try {
    const entries = await Promise.all(
      Array.from(seen).map(async (slotIso) => {
        const conflicts = await findScrimConflicts(supabaseAdmin!, {
          tenantId: ctx.tenantId,
          teamIds,
          slotIso,
        });
        return [slotIso, conflicts] as [string, SlotConflict[]];
      })
    );
    const conflicts: Record<string, SlotConflict[]> = {};
    for (const [slot, list] of entries) conflicts[slot] = list;
    return res.status(200).json({ conflicts });
  } catch (err) {
    logger.error('[admin/scrim-plannings/conflicts] error:', err);
    return res.status(500).json({ error: 'Failed to check conflicts' });
  }
}
