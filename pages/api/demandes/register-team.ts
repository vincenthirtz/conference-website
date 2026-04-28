// pages/api/demandes/register-team.ts
// Public: une equipe (via son capitaine) soumet sa candidature pour un tournoi.
// POST : creer une demande de type 'team_registration'
// GET  : recuperer ses propres demandes de type 'team_registration'

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';

export type RegisterTeamBody = {
  teamId: string;
  tournamentId: string;
  message?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-register')
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database not configured (missing service role).' });
  }

  // Auth via Bearer token
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
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'team_registration')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      console.error('[demandes/register-team] GET error:', demandesErr);
      return res.status(500).json({ error: 'Failed to load requests.' });
    }

    return res.status(200).json({ demandes: demandes || [] });
  }

  if (req.method === 'POST') {
    const body = req.body as RegisterTeamBody;

    if (!body?.teamId?.trim() || !body?.tournamentId?.trim()) {
      return res.status(400).json({
        error: 'teamId et tournamentId sont requis.',
      });
    }

    const teamId = body.teamId.trim();
    const tournamentId = body.tournamentId.trim();
    const rawMessage = body.message?.trim() || null;
    if (rawMessage && rawMessage.length > 1000) {
      return res
        .status(400)
        .json({ error: 'Message trop long (max 1000 caractères).' });
    }
    const message = rawMessage?.slice(0, 1000) || null;

    // Verify team exists and user is captain
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, captain_id, is_active')
      .eq('id', teamId)
      .maybeSingle();

    if (teamErr || !team) {
      return res.status(400).json({ error: "L'equipe n'existe pas." });
    }

    if (!team.is_active) {
      return res.status(400).json({ error: "L'equipe est desactivee." });
    }

    if (team.captain_id !== userId) {
      return res.status(403).json({
        error: "Seul le capitaine de l'equipe peut soumettre une inscription.",
      });
    }

    // Verify tournament exists and is published
    const { data: tournament, error: tourErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, max_teams, min_players')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tourErr || !tournament) {
      return res.status(400).json({ error: 'Tournoi introuvable.' });
    }

    if (tournament.status !== 'published') {
      return res.status(400).json({
        error: 'Les inscriptions ne sont pas ouvertes pour ce tournoi.',
      });
    }

    // Check team is not already registered
    const { data: existingReg } = await supabaseAdmin
      .from('tournament_teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (existingReg) {
      return res.status(400).json({
        error: 'Cette equipe est deja inscrite a ce tournoi.',
      });
    }

    // Check no pending registration request already exists
    const { data: existingDemande } = await supabaseAdmin
      .from('demandes')
      .select('id')
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId)
      .eq('type', 'team_registration')
      .eq('status', 'pending')
      .maybeSingle();

    if (existingDemande) {
      return res.status(400).json({
        error: "Une demande d'inscription est deja en attente pour ce tournoi.",
        existingDemandeId: existingDemande.id,
      });
    }

    // Check min_players
    if (tournament.min_players) {
      const { count: memberCount } = await supabaseAdmin
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId);

      if ((memberCount ?? 0) < tournament.min_players) {
        return res.status(400).json({
          error: `L'equipe doit avoir au moins ${tournament.min_players} joueur(s). Actuellement: ${memberCount ?? 0}.`,
        });
      }
    }

    // Check max_teams
    if (tournament.max_teams) {
      const { count: teamCount } = await supabaseAdmin
        .from('tournament_teams')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId);

      if ((teamCount ?? 0) >= tournament.max_teams) {
        return res.status(400).json({
          error: `Le tournoi a atteint le nombre maximum d'equipes (${tournament.max_teams}).`,
        });
      }
    }

    // Create demande
    const payload: Record<string, any> = {
      team_name: team.name,
      tournament_name: tournament.name,
      user_email: user.email,
      user_display_name:
        user.user_metadata?.display_name ||
        user.user_metadata?.full_name ||
        null,
    };

    const { data: newDemande, error: insertErr } = await supabaseAdmin
      .from('demandes')
      .insert({
        user_id: userId,
        team_id: teamId,
        tournament_id: tournamentId,
        type: 'team_registration',
        status: 'pending',
        comment: message,
        source: 'website',
        payload,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[demandes/register-team] insert error:', insertErr);
      return res
        .status(500)
        .json({ error: 'Echec de la creation de la demande.' });
    }

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message: `Candidature de "${team.name}" pour "${tournament.name}" envoyee. Un admin la validera.`,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
