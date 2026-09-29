// features/player/demandes/service/registerTeam.ts — candidature d'une équipe
// (par sa capitaine ou un manager) à un tournoi, et photo de son inscription
// au tournoi en cours. Déplacé de pages/api/demandes/register-team (lot P11) :
// mêmes règles, mêmes messages, même événement bot `registration.new`.

import { LegacyAdminError } from '@/utils/admin/errors';
import { emitBotEvent } from '@/utils/botEvents';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import {
  accessHasPermission,
  assertTeamPermission,
  getManagedTeam,
} from '@/utils/teams/managementAccess';
import {
  validateFieldDefinitions,
  validateRegistrationAnswers,
  type RegistrationField,
} from '@/utils/registrationFields';
import {
  findPendingDemande,
  insertDemande,
  listMyDemandes,
} from '../repository/demandes';
import {
  countRegisteredTeams,
  countRegistrationMembers,
  listTeamRegistrationDemandes,
  readTeam,
  readTournamentForRegistration,
  readTournamentRegistration,
} from '../repository/teams';
import type { RegisterTeamDemandeInput } from '../schemas';
import { displayNameOf, messageOf, type DemandesCtx } from './context';

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
 * espace équipe pour « réessayer ».
 */
export type TeamRegistrationStatus = {
  team: { id: string; name: string } | null;
  tournament: { id: string; name: string } | null;
  /** Inscription confirmée (`tournament_teams`). */
  registered: boolean;
  /** Candidature en attente de validation, quel qu'en soit l'auteur. */
  pendingDemandeId: string | null;
  /** Dernière candidature TRAITÉE de l'équipe (approuvée / refusée). */
  lastDemande: { id: string; status: string; created_at: string } | null;
  canSubmit: boolean;
  blockers: TeamRegistrationBlocker[];
  /**
   * Membres manquants pour atteindre `min_players`, 0 si le roster est complet.
   * AVERTISSEMENT, PAS BLOCAGE (décision produit 2026-08-27) : `min_players`
   * gouverne l'inscription automatique directe, les relances et la décision
   * du staff, pas le dépôt de la candidature.
   */
  rosterShortfall: number;
  minPlayers: number | null;
  /** Effectif compté comme le fait le POST — cf. `countRegistrationMembers`. */
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

/** Photo lue par la carte « Inscription au tournoi ». Best-effort. */
async function buildRegistrationStatus(
  ctx: DemandesCtx,
  requestedTeamId: string | null
): Promise<TeamRegistrationStatus> {
  const { db, tenantId } = ctx;
  const access = await getManagedTeam(ctx.userId, tenantId, requestedTeamId);
  if (!access) return EMPTY_STATUS;

  const { team } = await readTeam(
    db,
    tenantId,
    access.teamId,
    'id, name, is_active'
  );
  if (!team || !team.is_active) return EMPTY_STATUS;
  const teamRef = { id: team.id, name: team.name };

  const tournamentId = await resolveCurrentTournamentId(tenantId);
  if (!tournamentId) {
    return { ...EMPTY_STATUS, team: teamRef, blockers: ['no_tournament'] };
  }
  const { tournament } = await readTournamentForRegistration(
    db,
    tenantId,
    tournamentId
  );
  if (!tournament) {
    return { ...EMPTY_STATUS, team: teamRef, blockers: ['no_tournament'] };
  }

  const [existingReg, rows, playerCount] = await Promise.all([
    readTournamentRegistration(db, tenantId, tournamentId, team.id),
    listTeamRegistrationDemandes(db, tenantId, tournamentId, team.id),
    countRegistrationMembers(db, tenantId, team.id),
  ]);
  const pending = rows.find((d) => d.status === 'pending') ?? null;
  const lastHandled = rows.find((d) => d.status !== 'pending') ?? null;

  const fieldDefsResult = validateFieldDefinitions(
    tournament.registration_fields
  );
  const fields = fieldDefsResult.ok ? fieldDefsResult.fields : [];

  const minPlayers = Number(tournament.min_players) || null;
  const maxTeams = Number(tournament.max_teams) || null;
  const registeredTeams = maxTeams
    ? await countRegisteredTeams(db, tenantId, tournamentId)
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

/**
 * Demandes `team_registration` de l'appelante + `status` (ADDITIF : les
 * consommateurs historiques ne lisent que `demandes`).
 */
export async function listRegistrationDemandes(
  ctx: DemandesCtx,
  requestedTeamId: string | null
) {
  const { demandes, error } = await listMyDemandes(
    ctx.db,
    ctx.tenantId,
    ctx.userId,
    'team_registration'
  );
  if (error) {
    ctx.logger.error('[demandes/register-team] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load requests.');
  }
  let status: TeamRegistrationStatus = EMPTY_STATUS;
  try {
    status = await buildRegistrationStatus(ctx, requestedTeamId);
  } catch (err) {
    ctx.logger.error('[demandes/register-team] status error:', err);
  }
  return { demandes, status };
}

export async function submitRegistrationDemande(
  ctx: DemandesCtx,
  body: RegisterTeamDemandeInput,
  requestedTeamId: string | null
) {
  const { db, tenantId, userId, user } = ctx;
  const { teamId, tournamentId } = body;
  const message = messageOf(body.message);

  const { team, error: teamErr } = await readTeam(
    db,
    tenantId,
    teamId,
    'id, name, captain_id, is_active'
  );
  if (teamErr || !team)
    throw new LegacyAdminError(400, "L'equipe n'existe pas.");
  if (!team.is_active)
    throw new LegacyAdminError(400, "L'equipe est desactivee.");

  const access = await getManagedTeam(userId, tenantId, requestedTeamId);
  if (!access || access.teamId !== team.id) {
    throw new LegacyAdminError(
      403,
      "Seul le capitaine ou un manager de l'equipe peut soumettre une inscription."
    );
  }
  // Permission fine (R2) : `register_tournaments`, distincte du roster.
  const denied = assertTeamPermission(access, 'register_tournaments');
  if (denied) throw new LegacyAdminError(denied.status, denied.error);

  const { tournament, error: tourErr } = await readTournamentForRegistration(
    db,
    tenantId,
    tournamentId
  );
  if (tourErr || !tournament)
    throw new LegacyAdminError(400, 'Tournoi introuvable.');
  if (tournament.status !== 'published') {
    throw new LegacyAdminError(
      400,
      'Les inscriptions ne sont pas ouvertes pour ce tournoi.'
    );
  }

  // Réponses aux champs personnalisés, validées contre les définitions DU
  // tournoi ; recopiées dans tournament_teams à l'approbation.
  const fieldDefsResult = validateFieldDefinitions(
    tournament.registration_fields
  );
  const fieldDefs = fieldDefsResult.ok ? fieldDefsResult.fields : [];
  const answersResult = validateRegistrationAnswers(
    fieldDefs,
    body.field_values
  );
  if (!answersResult.ok) {
    throw new LegacyAdminError(400, "Champs d'inscription invalides.", {
      extra: { fieldErrors: answersResult.errors },
    });
  }

  if (await readTournamentRegistration(db, tenantId, tournamentId, teamId)) {
    throw new LegacyAdminError(
      400,
      'Cette equipe est deja inscrite a ce tournoi.'
    );
  }

  const { pending } = await findPendingDemande(db, tenantId, {
    teamId,
    tournamentId,
    types: ['team_registration'],
  });
  if (pending) {
    throw new LegacyAdminError(
      400,
      "Une demande d'inscription est deja en attente pour ce tournoi.",
      { extra: { existingDemandeId: pending.id } }
    );
  }

  // `min_players` NE BLOQUE PLUS (2026-08-27) : on compte pour le payload,
  // le staff arbitre l'écart à la validation.
  const memberCount = await countRegistrationMembers(db, tenantId, teamId);

  if (tournament.max_teams) {
    const teamCount = await countRegisteredTeams(db, tenantId, tournamentId);
    if (teamCount >= tournament.max_teams) {
      throw new LegacyAdminError(
        400,
        `Le tournoi a atteint le nombre maximum d'equipes (${tournament.max_teams}).`
      );
    }
  }

  const { demande, error: insertErr } = await insertDemande(db, tenantId, {
    user_id: userId,
    team_id: teamId,
    tournament_id: tournamentId,
    type: 'team_registration',
    comment: message,
    payload: {
      team_name: team.name,
      tournament_name: tournament.name,
      user_email: user.email,
      user_display_name: displayNameOf(user),
      field_values: answersResult.values,
      // Écart au roster requis, figé à la soumission.
      roster_players: memberCount,
      min_players: Number(tournament.min_players) || null,
    },
  });
  if (insertErr) {
    ctx.logger.error('[demandes/register-team] insert error:', insertErr);
    throw new LegacyAdminError(500, 'Echec de la creation de la demande.');
  }

  void emitBotEvent(
    'registration.new',
    {
      demande_id: (demande?.id as string | undefined) ?? null,
      team_id: teamId,
      team_name: team.name,
      tournament_id: tournamentId,
      tournament_name: tournament.name,
      captain_user_id: userId,
    },
    tenantId
  ).catch((err) =>
    ctx.logger.warn(
      '[demandes/register-team] registration.new emit failed',
      err
    )
  );

  return {
    success: true,
    demande,
    message: `Candidature de "${team.name}" pour "${tournament.name}" envoyee. Un admin la validera.`,
  };
}
