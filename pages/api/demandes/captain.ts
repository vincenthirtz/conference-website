// pages/api/demandes/captain.ts
// API pour les demandes de capitaine d'équipe
// - POST : créer une demande de capitaine (équipe existante ou nouvelle)
// - GET : récupérer ses propres demandes

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { captainRequestSchema, formatZodError } from '@/utils/validation';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-captain')
  )
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  if (req.method === 'GET') {
    // Récupérer les demandes de capitaine de l'utilisateur
    const { data: demandes, error: demandesErr } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'captain_request')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      logger.error('[demandes/captain] GET error:', demandesErr);
      return res.status(500).json({ error: 'Failed to load requests.' });
    }

    return res.status(200).json({ demandes: demandes || [] });
  }

  if (req.method === 'POST') {
    const parsed = captainRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) });
    }
    const body = parsed.data;

    const hasExistingTeam = !!body.existingTeamId;
    const message = body.message?.trim() || null;
    const members = body.members;

    // Vérifier s'il existe déjà une demande pending pour cet utilisateur
    const { data: existingDemande, error: existingErr } = await supabaseAdmin
      .from('demandes')
      .select('id, status')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'captain_request')
      .eq('status', 'pending')
      .maybeSingle();

    if (existingErr) {
      logger.error('[demandes/captain] check existing error:', existingErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingDemande) {
      return res.status(400).json({
        error: 'Tu as déjà une demande de capitaine en attente.',
        existingDemandeId: existingDemande.id,
      });
    }

    // Si équipe existante, vérifier qu'elle existe et récupérer ses infos
    let existingTeamName: string | null = null;
    if (hasExistingTeam) {
      const { data: teamData, error: teamErr } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('id', body.existingTeamId!)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (teamErr || !teamData) {
        return res
          .status(400)
          .json({ error: "L'équipe sélectionnée n'existe pas." });
      }

      existingTeamName = teamData.name;
    }

    // Construire le payload
    const payload: Record<string, any> = {
      user_email: user.email,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
      request_type: hasExistingTeam ? 'existing_team' : 'new_team',
    };

    if (hasExistingTeam) {
      payload.existing_team_id = body.existingTeamId!;
      payload.existing_team_name = existingTeamName;
    } else {
      payload.team_name = body.teamName!;
    }

    // Ajouter les membres si présents
    if (members.length > 0) {
      payload.members = members.map((m) => ({
        email: m.email,
        battle_tag: m.battleTag?.trim() || null,
        display_name: m.displayName?.trim() || null,
        specialty: m.specialty ?? null,
      }));
    }

    // Créer la demande
    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        team_id: hasExistingTeam ? body.existingTeamId! : null,
        type: 'captain_request',
        status: 'pending',
        comment: message,
        source: 'website',
        payload,
        tenant_id: tenantId,
      })
      .select('*')
      .single();

    if (insertErr) {
      logger.error('[demandes/captain] insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to create request.' });
    }

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message:
        'Ta demande de capitaine a été envoyée. Un admin la validera prochainement.',
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
