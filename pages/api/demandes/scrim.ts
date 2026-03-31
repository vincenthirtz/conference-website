// pages/api/demandes/scrim.ts
// API pour les demandes de scrim (match amical entre deux equipes)
// - POST : creer une demande de scrim
// - GET  : recuperer ses propres demandes de type "scrim"

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export type ScrimRequestBody = {
  teamId: string;
  message?: string;
  preferredDate?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'demandes-scrim')) return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database not configured (missing service role).' });
  }

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
      .eq('type', 'scrim')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      console.error('[demandes/scrim] GET error:', demandesErr);
      return res
        .status(500)
        .json({ error: 'Failed to load requests.' });
    }

    return res.status(200).json({ demandes: demandes || [] });
  }

  if (req.method === 'POST') {
    const body = req.body as ScrimRequestBody;

    if (!body?.teamId?.trim()) {
      return res.status(400).json({
        error: 'Selectionne une equipe adverse.',
      });
    }

    const teamId = body.teamId.trim();
    const rawMessage = body.message?.trim() || null;
    if (rawMessage && rawMessage.length > 1000) {
      return res.status(400).json({ error: 'Message trop long (max 1000 caracteres).' });
    }
    const message = rawMessage?.slice(0, 1000) || null;

    // Verifier que le joueur est dans une equipe et est capitaine
    const { data: currentMembership, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (memberErr) {
      console.error('[demandes/scrim] check member error:', memberErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (!currentMembership) {
      return res.status(400).json({
        error: "Tu n'es membre d'aucune equipe.",
      });
    }

    const { data: myTeam } = await supabaseAdmin
      .from('teams')
      .select('id, captain_id, name')
      .eq('id', currentMembership.team_id)
      .maybeSingle();

    if (myTeam?.captain_id !== userId) {
      return res.status(403).json({
        error: 'Seul le capitaine peut envoyer une demande de scrim.',
      });
    }

    // Ne peut pas demander un scrim contre sa propre equipe
    if (currentMembership.team_id === teamId) {
      return res.status(400).json({
        error: 'Tu ne peux pas demander un scrim contre ta propre equipe.',
      });
    }

    // Verifier que l'equipe cible existe
    const { data: targetTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .eq('is_active', true)
      .maybeSingle();

    if (teamErr || !targetTeam) {
      return res.status(400).json({ error: "L'equipe cible n'existe pas." });
    }

    // Verifier s'il existe deja une demande de scrim pending vers cette equipe
    const { data: existingDemande, error: existingErr } = await supabaseAdmin
      .from('demandes')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'scrim')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingErr) {
      console.error('[demandes/scrim] check existing error:', existingErr);
      return res.status(500).json({ error: 'Verification error.' });
    }

    if (existingDemande) {
      return res.status(400).json({
        error: 'Tu as deja une demande de scrim en attente vers cette equipe.',
      });
    }

    // Valider la date preferee si fournie
    let preferredDate: string | null = null;
    if (body.preferredDate?.trim()) {
      const d = new Date(body.preferredDate.trim());
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Date invalide.' });
      }
      preferredDate = d.toISOString();
    }

    const payload: Record<string, unknown> = {
      user_email: user.email,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
      from_team_id: myTeam.id,
      from_team_name: myTeam.name,
      target_team_name: targetTeam.name,
      preferred_date: preferredDate,
    };

    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        team_id: teamId,
        type: 'scrim',
        status: 'pending',
        comment: message,
        source: 'website',
        payload,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[demandes/scrim] insert error:', insertErr);
      return res
        .status(500)
        .json({ error: 'Failed to create request.' });
    }

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message: `Ta demande de scrim contre "${targetTeam.name}" a ete envoyee.`,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
