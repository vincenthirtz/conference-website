// pages/api/demandes/register-team.ts
// Public: une equipe (via son capitaine) soumet sa candidature pour un tournoi.
// POST : creer une demande de type 'team_registration'
// GET  : recuperer ses propres demandes de type 'team_registration'

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { emitBotEvent } from '@/utils/botEvents';
import {
  validateFieldDefinitions,
  validateRegistrationAnswers,
} from '@/utils/registrationFields';

import { logger } from '../../../utils/logger';
export type RegisterTeamBody = {
  teamId: string;
  tournamentId: string;
  message?: string;
  /** Réponses aux champs d'inscription personnalisés du tournoi (Flow B). */
  field_values?: Record<string, unknown> | null;
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'demandes-register')
  )
    return;

  const userId = user.id;
  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: userId,
  });

  if (req.method === 'GET') {
    const { data: demandes, error: demandesErr } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('type', 'team_registration')
      .order('created_at', { ascending: false });

    if (demandesErr) {
      logger.error('[demandes/register-team] GET error:', demandesErr);
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

    // Verify team exists
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, captain_id, is_active')
      .eq('id', teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (teamErr || !team) {
      return res.status(400).json({ error: "L'equipe n'existe pas." });
    }

    if (!team.is_active) {
      return res.status(400).json({ error: "L'equipe est desactivee." });
    }

    // Verify user can manage the team (captain or manager)
    const access = await getManagedTeam(userId, tenantId);
    if (!access || access.teamId !== team.id) {
      return res.status(403).json({
        error:
          "Seul le capitaine ou un manager de l'equipe peut soumettre une inscription.",
      });
    }

    // Permission fine (R2) : inscrire l'équipe est une permission à part
    // entière (`register_tournaments`), distincte de la gestion du roster.
    const denied = assertTeamPermission(access, 'register_tournaments');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    // Verify tournament exists and is published
    const { data: tournament, error: tourErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, max_teams, min_players, registration_fields')
      .eq('id', tournamentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tourErr || !tournament) {
      return res.status(400).json({ error: 'Tournoi introuvable.' });
    }

    if (tournament.status !== 'published') {
      return res.status(400).json({
        error: 'Les inscriptions ne sont pas ouvertes pour ce tournoi.',
      });
    }

    // Champs d'inscription personnalisés : valider les réponses contre les
    // définitions du tournoi. Les valeurs nettoyées sont stockées dans le
    // payload de la demande (payload.field_values) et recopiées dans
    // tournament_teams à l'approbation.
    const fieldDefsResult = validateFieldDefinitions(
      tournament.registration_fields
    );
    const fieldDefs = fieldDefsResult.ok ? fieldDefsResult.fields : [];
    const answersResult = validateRegistrationAnswers(
      fieldDefs,
      body.field_values
    );
    if (!answersResult.ok) {
      return res.status(400).json({
        error: "Champs d'inscription invalides.",
        fieldErrors: answersResult.errors,
      });
    }

    // Check team is not already registered
    const { data: existingReg } = await supabaseAdmin
      .from('tournament_teams')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
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
      .eq('tenant_id', tenantId)
      .eq('type', 'team_registration')
      .eq('status', 'pending')
      .maybeSingle();

    if (existingDemande) {
      return res.status(400).json({
        error: "Une demande d'inscription est deja en attente pour ce tournoi.",
        existingDemandeId: existingDemande.id,
      });
    }

    // Check min_players — nombre de JOUEURS (player + substitute), coachs
    // EXCLUS (décision produit : un coach ne compte pas dans le roster
    // minimum requis pour s'inscrire).
    if (tournament.min_players) {
      const { count: memberCount } = await supabaseAdmin
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId)
        .neq('role', 'coach');

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
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId);

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
      field_values: answersResult.values,
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
        tenant_id: tenantId,
      })
      .select('*')
      .single();

    if (insertErr) {
      logger.error('[demandes/register-team] insert error:', insertErr);
      return res
        .status(500)
        .json({ error: 'Echec de la creation de la demande.' });
    }

    void emitBotEvent(
      'registration.new',
      {
        demande_id: newDemande?.id ?? null,
        team_id: teamId,
        team_name: team.name,
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        captain_user_id: userId,
      },
      tenantId
    ).catch((err) =>
      logger.warn('[demandes/register-team] registration.new emit failed', err)
    );

    return res.status(201).json({
      success: true,
      demande: newDemande,
      message: `Candidature de "${team.name}" pour "${tournament.name}" envoyee. Un admin la validera.`,
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
