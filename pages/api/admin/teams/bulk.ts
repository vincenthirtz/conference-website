// pages/api/admin/teams/bulk.ts
// POST : operations en lot sur les equipes
//
// Body :
//   { action: 'delete',     teamIds: string[] }
//   { action: 'activate',   teamIds: string[] }
//   { action: 'deactivate', teamIds: string[] }
//   { action: 'assign',     teamIds: string[], tournamentId: string }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';
type BulkAction = 'delete' | 'activate' | 'deactivate' | 'assign';

type BulkBody = {
  action: BulkAction;
  teamIds: string[];
  tournamentId?: string;
};

type ApiResponse =
  | { success: boolean; count: number; action: string }
  | { error: string };

// Idempotency-Key (optionnel) : l'UI admin (bulk teams via
// useIdempotentMutation) envoie une clé. Un rejeu avec la même clé rejoue la
// réponse cache (5 min) au lieu de re-supprimer / re-modifier en masse.
// Header absent → comportement normal (rétro-compatible).
export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-teams-bulk' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const body = req.body as BulkBody;

  if (!body?.action) {
    return res.status(400).json({ error: "Champ 'action' requis" });
  }

  if (!Array.isArray(body.teamIds) || body.teamIds.length === 0) {
    return res
      .status(400)
      .json({ error: "Champ 'teamIds' requis (tableau non vide)" });
  }

  if (body.teamIds.length > 200) {
    return res.status(400).json({ error: 'Maximum 200 equipes par operation' });
  }

  const { action, teamIds, tournamentId } = body;
  const nowIso = new Date().toISOString();
  let count = 0;

  try {
    switch (action) {
      case 'delete': {
        const { data, error } = await supabaseAdmin
          .from('teams')
          .update({ is_active: false, deleted_at: nowIso, updated_at: nowIso })
          .in('id', teamIds)
          .eq('tenant_id', ctx.tenantId)
          .select('id');

        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'activate': {
        const { data, error } = await supabaseAdmin
          .from('teams')
          .update({ is_active: true, deleted_at: null, updated_at: nowIso })
          .in('id', teamIds)
          .eq('tenant_id', ctx.tenantId)
          .select('id');

        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'deactivate': {
        const { data, error } = await supabaseAdmin
          .from('teams')
          .update({ is_active: false, deleted_at: nowIso, updated_at: nowIso })
          .in('id', teamIds)
          .eq('tenant_id', ctx.tenantId)
          .select('id');

        if (error) throw error;
        count = data?.length ?? 0;
        break;
      }

      case 'assign': {
        if (!tournamentId) {
          return res.status(400).json({
            error: "Champ 'tournamentId' requis pour l'action 'assign'",
          });
        }

        // Verify tournament exists (scoped to current tenant)
        const { data: tournament } = await supabaseAdmin
          .from('tournaments')
          .select('id')
          .eq('id', tournamentId)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (!tournament) {
          return res.status(404).json({ error: 'Tournoi introuvable' });
        }

        // Upsert to safely handle concurrent requests (ignore duplicates)
        const rows = teamIds.map((tid) => ({
          tenant_id: ctx.tenantId,
          tournament_id: tournamentId,
          team_id: tid,
          status: 'registered',
        }));

        const { data: upserted, error } = await supabaseAdmin
          .from('tournament_teams')
          .upsert(rows, {
            onConflict: 'tournament_id,team_id',
            ignoreDuplicates: true,
          })
          .select('id');

        if (error) throw error;
        count = upserted?.length ?? 0;
        break;
      }

      default:
        return res.status(400).json({ error: `Action inconnue: ${action}` });
    }

    // Log staff action
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'staff_batch_action',
          entity_type: 'team',
          tournament_id: tournamentId || null,
          payload: {
            action_label: `bulk_${action}`,
            team_ids: teamIds,
            count,
          },
        });
      } catch (e) {
        logger.error('bulk teams logStaffAction error:', e);
      }
    }

    return res.status(200).json({ success: true, count, action });
  } catch (err: unknown) {
    logger.error('[/api/admin/teams/bulk] error:', err);
    return res.status(500).json({
      error: (err as Error)?.message || 'Erreur interne',
    });
  }
}
