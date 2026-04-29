// pages/api/teams/scrim-requests.ts
// API pour le capitaine : gerer les demandes de scrim recues
// - GET  : lister les demandes de scrim pending pour son equipe
// - POST : accepter ou refuser une demande de scrim
//          Si acceptee, cree une demande admin de type 'scrim' avec status 'approved'

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'scrim-requests'))
    return;

  const userId = user.id;

  // Check captain
  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('captain_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (teamErr || !captainTeam) {
    return res
      .status(403)
      .json({ error: "Tu dois etre capitaine d'une equipe active." });
  }

  if (req.method === 'GET') {
    const statusFilter = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('team_id', captainTeam.id)
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
      console.error('[scrim-requests] GET error:', demandesErr);
      return res.status(500).json({ error: 'Echec du chargement.' });
    }

    // Enrich with sender info
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
              };
            }
          } catch {
            // skip
          }
        }
        return {
          id: d.id,
          user_id: d.user_id,
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

    if (action !== 'approve' && action !== 'reject') {
      return res
        .status(400)
        .json({ error: 'Action invalide. Utilise "approve" ou "reject".' });
    }

    const { data: demande, error: fetchErr } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('id', demandeId)
      .eq('team_id', captainTeam.id)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchErr || !demande) {
      return res
        .status(404)
        .json({ error: 'Demande introuvable ou deja traitee.' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update the demande
    const { error: updateErr } = await supabaseAdmin
      .from('demandes')
      .update({
        status: newStatus,
        processed_at: new Date().toISOString(),
        staff_note: `Traite par le capitaine (${userId})`,
      })
      .eq('id', demandeId);

    if (updateErr) {
      console.error('[scrim-requests] update error:', updateErr);
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
      });
    }

    return res.status(200).json({
      success: true,
      demandeId,
      newStatus,
      message:
        action === 'approve'
          ? "Scrim accepte ! L'equipe organisatrice a ete notifiee."
          : 'Demande de scrim refusee.',
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
