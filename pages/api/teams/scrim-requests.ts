// pages/api/teams/scrim-requests.ts
// API pour le capitaine : gerer les demandes de scrim recues
// - GET  : lister les demandes de scrim pending pour son equipe
// - POST : accepter ou refuser une demande de scrim
//          Si acceptee, cree une demande admin de type 'scrim' avec status 'approved'

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, applyActorRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'scrim-requests'))
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  // Per-user cap : refuser le spam de scrim accept/reject (a chaque
  // accept, on cree un scrim draft cote /admin/demandes auto-process).
  if (
    applyActorRateLimit(
      res,
      userId,
      { max: 5, windowMs: 60_000 },
      'scrim-requests'
    )
  )
    return;

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr || !captainTeam) {
    return res.status(404).json({ error: 'Team introuvable.' });
  }

  if (req.method === 'GET') {
    const statusFilter = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('team_id', captainTeam.id)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .order('created_at', { ascending: false });

    if (
      statusFilter &&
      ['pending', 'approved', 'rejected', 'cancelled'].includes(statusFilter)
    ) {
      query = query.eq('status', statusFilter);
    } else {
      query = query.eq('status', 'pending');
    }

    const { data: demandes, error: demandesErr } = await query;

    if (demandesErr) {
      logger.error('[scrim-requests] GET error:', demandesErr);
      return res.status(500).json({ error: 'Echec du chargement.' });
    }

    // Enrich with sender info. Authenticated requests carry user_id and we
    // look up the auth user; public (external) requests have user_id=null and
    // we surface the contact info from payload instead so the captain can
    // reach back.
    const enriched = await Promise.all(
      (demandes || []).map(async (d: any) => {
        let userInfo = null;
        if (d.user_id) {
          try {
            const { data: u } = await supabaseAdmin!.auth.admin.getUserById(
              d.user_id
            );
            if (u?.user) {
              const meta = u.user.user_metadata ?? {};
              userInfo = {
                id: d.user_id,
                email: u.user.email || null,
                display_name: meta.display_name || meta.full_name || null,
                discord: meta.discord || null,
              };
            }
          } catch {
            // skip
          }
        } else if (d.source === 'public' && d.payload) {
          const p = d.payload as Record<string, any>;
          userInfo = {
            id: null,
            email: p.requester_email || null,
            display_name: p.requester_name || null,
            discord: p.requester_discord || null,
          };
        }
        return {
          id: d.id,
          user_id: d.user_id,
          source: d.source,
          status: d.status,
          comment: d.comment,
          payload: d.payload,
          created_at: d.created_at,
          user: userInfo,
        };
      })
    );

    return res.status(200).json({ demandes: enriched });
  }

  if (req.method === 'POST') {
    const { demandeId, action } = req.body || {};

    if (
      !demandeId ||
      typeof demandeId !== 'string' ||
      !isValidUUID(demandeId)
    ) {
      return res.status(400).json({ error: 'demandeId invalide.' });
    }

    if (action !== 'approve' && action !== 'reject' && action !== 'report') {
      return res.status(400).json({
        error: 'Action invalide. Utilise "approve", "reject" ou "report".',
      });
    }

    const { data: demande, error: fetchErr } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('id', demandeId)
      .eq('team_id', captainTeam.id)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchErr || !demande) {
      return res
        .status(404)
        .json({ error: 'Demande introuvable ou deja traitee.' });
    }

    // 'report' is only valid for public (external) scrim requests.
    if (action === 'report' && (demande as any).source !== 'public') {
      return res.status(400).json({
        error: 'Seules les demandes externes peuvent être signalées.',
      });
    }

    const newStatus =
      action === 'approve'
        ? 'approved'
        : action === 'report'
          ? 'cancelled'
          : 'rejected';

    const staffNote =
      action === 'report'
        ? `Signalée comme spam par le capitaine (${userId})`
        : `Traite par le capitaine (${userId})`;

    // Update the demande
    const { error: updateErr } = await supabaseAdmin
      .from('demandes')
      .update({
        status: newStatus,
        processed_at: new Date().toISOString(),
        staff_note: staffNote,
      })
      .eq('id', demandeId)
      .eq('tenant_id', tenantId);

    if (updateErr) {
      logger.error('[scrim-requests] update error:', updateErr);
      return res.status(500).json({ error: 'Echec de la mise a jour.' });
    }

    // If approved, create a notification demande visible in admin
    if (action === 'approve') {
      const payload = (demande as any).payload || {};
      const fromTeamName = payload.from_team_name || 'Equipe inconnue';
      const preferredDate = payload.preferred_date || null;

      await supabaseAdmin.from('demandes').insert({
        user_id: null,
        team_id: captainTeam.id,
        type: 'other',
        status: 'pending',
        source: 'website',
        comment:
          `Scrim accepte : ${fromTeamName} vs ${captainTeam.name}` +
          (preferredDate
            ? ` (date souhaitee : ${new Date(preferredDate).toLocaleDateString('fr-FR')})`
            : '') +
          ((demande as any).comment ? ` — "${(demande as any).comment}"` : ''),
        payload: {
          notification_type: 'scrim_accepted',
          from_team_id: payload.from_team_id,
          from_team_name: fromTeamName,
          target_team_id: captainTeam.id,
          target_team_name: captainTeam.name,
          preferred_date: preferredDate,
          original_demande_id: demandeId,
        },
        tenant_id: tenantId,
      });
    }

    return res.status(200).json({
      success: true,
      demandeId,
      newStatus,
      message:
        action === 'approve'
          ? "Scrim accepte ! L'equipe organisatrice a ete notifiee."
          : action === 'report'
            ? 'Demande signalée. Le staff la passera en revue.'
            : 'Demande de scrim refusee.',
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
