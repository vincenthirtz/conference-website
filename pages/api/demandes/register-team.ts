// pages/api/demandes/register-team.ts
// Public: une equipe (via son capitaine ou son manager) soumet sa candidature
// pour un tournoi.
// POST : creer une demande de type 'team_registration'
// GET  : ses propres demandes 'team_registration' + `status`, la photo de
//        l'inscription de l'equipe au tournoi en cours (cf.
//        TeamRegistrationStatus) que lit la carte de l'espace equipe.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  accessHasPermission,
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import { emitBotEvent } from '@/utils/botEvents';
import {
  validateFieldDefinitions,
  validateRegistrationAnswers,
  type RegistrationField,
} from '@/utils/registrationFields';

import { logger } from '../../../utils/logger';
export type RegisterTeamBody = {
  teamId: string;
  tournamentId: string;
  message?: string;
  /** Réponses aux champs d'inscription personnalisés du tournoi (Flow B). */
  field_values?: Record<string, unknown> | null;
};

/**
 * Ce qui empêche l'équipe de déposer sa candidature, en CODES et non en
 * phrases : l'UI porte le libellé, le « pourquoi » et le geste qui répare —
 * même séparation que les constats de `utils/teams/teamHealth.ts`.
 */
export type TeamRegistrationBlocker =
  /** Aucun tournoi en cours dans ce tenant. */
  | 'no_tournament'
  /** Le tournoi existe mais ses inscriptions ne sont pas ouvertes. */
  | 'not_open'
  /** L'équipe y est déjà inscrite. */
  | 'already_registered'
  /** Une candidature attend déjà la validation du staff. */
  | 'pending_request'
  /** Le tournoi a atteint `max_teams`. */
  | 'tournament_full'
  /** Le rôle de l'appelant ne couvre pas `register_tournaments`. */
  | 'no_permission';

/**
 * Photo de l'inscription de l'équipe au tournoi en cours.
 *
 * Elle existe parce que le chemin d'inscription automatique
 * (`/api/teams/create-with-member`) est BEST-EFFORT : il crée l'équipe même
 * quand l'inscription échoue, et le wizard renvoie alors la capitaine vers son
 * espace équipe pour « réessayer ». Sans cette lecture, cet espace n'avait
 * aucun moyen de savoir où en était l'inscription — donc aucun bouton à
 * offrir, et le renvoi tournait à l'impasse.
 */
export type TeamRegistrationStatus = {
  team: { id: string; name: string } | null;
  tournament: { id: string; name: string } | null;
  /** Inscription confirmée (`tournament_teams`). */
  registered: boolean;
  /** Candidature en attente de validation, quel qu'en soit l'auteur. */
  pendingDemandeId: string | null;
  /**
   * Dernière candidature TRAITÉE de l'équipe (approuvée / refusée). Sans elle,
   * une équipe refusée voit un bouton « s'inscrire » et rien qui explique
   * pourquoi sa demande précédente n'a rien donné.
   */
  lastDemande: { id: string; status: string; created_at: string } | null;
  canSubmit: boolean;
  blockers: TeamRegistrationBlocker[];
  /**
   * Membres manquants pour atteindre `min_players`, 0 si le roster est complet.
   *
   * AVERTISSEMENT, PAS BLOCAGE (décision produit 2026-08-27) : un roster
   * incomplet n'empêche plus de candidater. Une équipe se compose souvent
   * APRÈS s'être manifestée, et refuser la candidature jusqu'à la 5ᵉ joueuse
   * revenait à rendre l'inscription invisible du staff pendant tout ce temps —
   * exactement ce qui a été observé sur l'édition 2026. `min_players` reste la
   * règle de COMPLÉTUDE : elle gouverne l'inscription automatique directe, les
   * relances Discord, la santé d'équipe et la décision de validation du staff.
   */
  rosterShortfall: number;
  minPlayers: number | null;
  /** Effectif compté comme le fait le POST — voir `countRegistrationMembers`. */
  playerCount: number;
  maxTeams: number | null;
  registeredTeams: number;
  /** Champs d'inscription personnalisés à remplir avant de candidater. */
  fields: RegistrationField[];
};

const EMPTY_STATUS: TeamRegistrationStatus = {
  team: null,
  tournament: null,
  registered: false,
  pendingDemandeId: null,
  lastDemande: null,
  canSubmit: false,
  blockers: [],
  rosterShortfall: 0,
  minPlayers: null,
  playerCount: 0,
  maxTeams: null,
  registeredTeams: 0,
  fields: [],
};

/**
 * Effectif retenu pour `min_players`.
 *
 * Partagé entre le GET (qui annonce l'éligibilité) et le POST (qui la
 * tranche) : deux décomptes divergents feraient mentir la carte — « prête à
 * s'inscrire » suivi d'un refus, ou l'inverse.
 *
 * NB : seul le rôle `coach` est exclu, PAS `manager`. C'est le comportement
 * historique du POST, laissé intact — le changer déplacerait la règle
 * d'éligibilité d'un tournoi en cours.
 */
async function countRegistrationMembers(
  tenantId: string,
  teamId: string
): Promise<number> {
  const { count } = await supabaseAdmin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .neq('role', 'coach');
  return count ?? 0;
}

/** Nombre d'équipes déjà inscrites au tournoi (plafond `max_teams`). */
async function countRegisteredTeams(
  tenantId: string,
  tournamentId: string
): Promise<number> {
  const { count } = await supabaseAdmin
    .from('tournament_teams')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
  return count ?? 0;
}

/**
 * Assemble la photo lue par la carte « Inscription au tournoi ».
 *
 * Best-effort de bout en bout : une lecture qui échoue ne fait pas échouer le
 * GET (la liste des demandes reste utile), elle renvoie une photo vide.
 */
async function buildRegistrationStatus(
  req: NextApiRequest,
  userId: string,
  tenantId: string
): Promise<TeamRegistrationStatus> {
  const access = await getManagedTeamForRequest(req, userId, tenantId);
  if (!access) return EMPTY_STATUS;

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, is_active')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!team || !team.is_active) return EMPTY_STATUS;

  const teamRef = { id: team.id as string, name: team.name as string };

  const tournamentId = await resolveCurrentTournamentId(tenantId);
  if (!tournamentId) {
    return {
      ...EMPTY_STATUS,
      team: teamRef,
      blockers: ['no_tournament'],
    };
  }

  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, status, max_teams, min_players, registration_fields')
    .eq('id', tournamentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!tournament) {
    return { ...EMPTY_STATUS, team: teamRef, blockers: ['no_tournament'] };
  }

  const [{ data: existingReg }, { data: demandes }, playerCount] =
    await Promise.all([
      supabaseAdmin
        .from('tournament_teams')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('team_id', team.id)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      // Toutes les candidatures de l'ÉQUIPE, pas seulement celles de
      // l'appelant : dans une équipe à deux encadrants, la demande déposée par
      // l'autre doit être visible ici, sinon la carte propose de la doubler.
      supabaseAdmin
        .from('demandes')
        .select('id, status, created_at')
        .eq('team_id', team.id)
        .eq('tournament_id', tournamentId)
        .eq('tenant_id', tenantId)
        .eq('type', 'team_registration')
        .order('created_at', { ascending: false }),
      countRegistrationMembers(tenantId, team.id),
    ]);

  const rows = (demandes ?? []) as {
    id: string;
    status: string;
    created_at: string;
  }[];
  const pending = rows.find((d) => d.status === 'pending') ?? null;
  const lastHandled = rows.find((d) => d.status !== 'pending') ?? null;

  const fieldDefsResult = validateFieldDefinitions(
    tournament.registration_fields
  );
  const fields = fieldDefsResult.ok ? fieldDefsResult.fields : [];

  const minPlayers = Number(tournament.min_players) || null;
  const maxTeams = Number(tournament.max_teams) || null;
  const registeredTeams = maxTeams
    ? await countRegisteredTeams(tenantId, tournamentId)
    : 0;

  const blockers: TeamRegistrationBlocker[] = [];
  if (tournament.status !== 'published') blockers.push('not_open');
  if (existingReg) blockers.push('already_registered');
  if (pending) blockers.push('pending_request');
  if (maxTeams && registeredTeams >= maxTeams) blockers.push('tournament_full');
  if (!accessHasPermission(access, 'register_tournaments')) {
    blockers.push('no_permission');
  }

  // Volontairement HORS `blockers` : cf. le champ `rosterShortfall`.
  const rosterShortfall = minPlayers
    ? Math.max(0, minPlayers - playerCount)
    : 0;

  return {
    team: teamRef,
    tournament: { id: tournament.id, name: tournament.name },
    registered: Boolean(existingReg),
    pendingDemandeId: pending?.id ?? null,
    lastDemande: lastHandled,
    canSubmit: blockers.length === 0,
    blockers,
    rosterShortfall,
    minPlayers,
    playerCount,
    maxTeams,
    registeredTeams,
    fields,
  };
}

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

    // `status` est ADDITIF : les consommateurs existants lisent toujours
    // `demandes`. Il porte la photo dont la carte « Inscription au tournoi » a
    // besoin (espace équipe) — l'historique des demandes seul ne dit ni à quel
    // tournoi s'inscrire, ni si l'équipe y est déjà, ni ce qui la bloque.
    let status: TeamRegistrationStatus = EMPTY_STATUS;
    try {
      status = await buildRegistrationStatus(req, userId, tenantId);
    } catch (err) {
      logger.error('[demandes/register-team] status error:', err);
    }

    return res.status(200).json({ demandes: demandes || [], status });
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
    const access = await getManagedTeamForRequest(req, userId, tenantId);
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

    // `min_players` NE BLOQUE PLUS la candidature (décision produit
    // 2026-08-27). Une équipe se compose souvent après s'être manifestée, et
    // refuser sa candidature jusqu'à la 5ᵉ joueuse la rendait invisible du
    // staff pendant toute cette période — le cas observé sur l'édition 2026.
    // On COMPTE quand même, pour le poser dans le payload : le staff voit
    // l'écart au moment de valider, et c'est là que la règle s'applique.
    const memberCount = await countRegistrationMembers(tenantId, teamId);

    // Check max_teams
    if (tournament.max_teams) {
      const teamCount = await countRegisteredTeams(tenantId, tournamentId);

      if (teamCount >= tournament.max_teams) {
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
      // Écart au roster requis, figé à la soumission : c'est ce que le staff
      // arbitre. Un roster complet donne simplement `roster_players >=
      // min_players`.
      roster_players: memberCount,
      min_players: Number(tournament.min_players) || null,
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
