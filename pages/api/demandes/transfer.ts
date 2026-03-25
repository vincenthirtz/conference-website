// pages/api/demandes/transfer.ts
// API pour les demandes de transfert (joueur deja dans une equipe -> autre equipe)
// - POST : creer une demande de transfert
// - GET  : recuperer ses propres demandes de type "transfer"

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export type TransferRequestBody = {
  teamId: string;
  desiredRole?: 'player' | 'substitute' | 'coach';
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'demandes-transfer')) return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database not configured (missing service role).' });
  }

  // Authentification via Bearer token
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Token required.' });
  }

  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.getUser(token);

  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const user = userData.user;
  const userId = user.id;

  if (req.method === 'GET') {
    const { data: demandes, error: demandesErr } = await supabaseAdmin
      .from('demandes')
      .select('*, team:teams!team_id(id, name, short_name, logo_url)')
      .eq('user_id', userId)
      .eq('type', 'transfer')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      console.error('[demandes/transfer] GET error:', demandesErr);
      return res
        .status(500)
        .json({ error: 'Failed to load requests.' });
    }

    return res.status(200).json({ demandes: demandes || [] });
  }

  if (req.method === 'POST') {
    const body = req.body as TransferRequestBody;

    if (!body?.teamId?.trim()) {
      return res.status(400).json({
        error: 'Selectionne une equipe cible.',
      });
    }

    const teamId = body.teamId.trim();
    const rawMessage = body.message?.trim() || null;
    if (rawMessage && rawMessage.length > 1000) {
      return res.status(400).json({ error: 'Message trop long (max 1000 caracteres).' });
    }
    const message = rawMessage?.slice(0, 1000) || null;

    // Verifier que le joueur est bien dans une equipe actuellement
    const { data: currentMembership, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id, role')
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) {
      console.error('[demandes/transfer] check member error:', memberErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (!currentMembership) {
      return res.status(400).json({
        error: "Tu n'es membre d'aucune equipe. Utilise la demande de join a la place.",
      });
    }

    // Ne peut pas demander un transfert vers sa propre equipe
    if (currentMembership.team_id === teamId) {
      return res.status(400).json({
        error: 'Tu es deja dans cette equipe.',
      });
    }

    // Verifier que le capitaine ne peut pas demander un transfert
    const { data: currentTeam } = await supabaseAdmin
      .from('teams')
      .select('captain_id, name')
      .eq('id', currentMembership.team_id)
      .maybeSingle();

    if (currentTeam?.captain_id === userId) {
      return res.status(403).json({
        error: 'Le capitaine ne peut pas demander un transfert. Transfere le role de capitaine d\'abord.',
      });
    }

    // Verifier que l'equipe cible existe et est rejoignable
    const { data: targetTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, is_joinable')
      .eq('id', teamId)
      .eq('is_active', true)
      .maybeSingle();

    if (teamErr || !targetTeam) {
      return res.status(400).json({ error: "L'equipe cible n'existe pas." });
    }

    if (!targetTeam.is_joinable) {
      return res.status(400).json({ error: "Cette equipe n'accepte pas les demandes pour le moment." });
    }

    // Verifier s'il existe deja une demande pending (join ou transfer)
    const { data: existingDemande, error: existingErr } = await supabaseAdmin
      .from('demandes')
      .select('id, status, team_id, type')
      .eq('user_id', userId)
      .in('type', ['join', 'transfer'])
      .eq('status', 'pending')
      .maybeSingle();

    if (existingErr) {
      console.error('[demandes/transfer] check existing error:', existingErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingDemande) {
      return res.status(400).json({
        error: 'Tu as deja une demande en attente. Annule-la d\'abord.',
        existingDemandeId: existingDemande.id,
      });
    }

    // Valider le role souhaite
    const rawRole = body.desiredRole?.trim().toLowerCase();
    const desiredRole =
      rawRole === 'substitute' ? 'substitute' :
      rawRole === 'coach' ? 'coach' :
      'player';

    // Construire le payload
    const payload: Record<string, unknown> = {
      user_email: user.email,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
      user_battle_tag: user.user_metadata?.battle_tag || null,
      team_name: targetTeam.name,
      desired_role: desiredRole,
      from_team_id: currentMembership.team_id,
      from_team_name: currentTeam?.name || null,
    };

    // Creer la demande
    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        team_id: teamId,
        type: 'transfer',
        status: 'pending',
        comment: message,
        source: 'website',
        payload,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[demandes/transfer] insert error:', insertErr);
      return res
        .status(500)
        .json({ error: 'Failed to create request.' });
    }

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message: `Ta demande de transfert vers "${targetTeam.name}" a ete envoyee. Le capitaine de l'equipe cible la validera.`,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
