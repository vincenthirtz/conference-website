// features/player/onboarding/service/tournament.ts — étape 7 : rattacher la
// nouvelle équipe au tournoi visé. Best-effort de bout en bout : l'équipe est
// créée quoi qu'il arrive ici (NEEDS_REVIEW journalisé en cas d'échec).
//
// DEUX EFFECTIFS, DEUX DÉCISIONS. Depuis le modèle invite-accept, le seul
// membre confirmé à la création est la créatrice (qui, manager, ne joue même
// pas) :
//   - effectif CONFIRMÉ ≥ `min_players` → inscription directe ;
//   - sinon → CANDIDATURE `team_registration` en attente du staff (même
//     objet que /api/demandes/register-team). Aucun effectif minimum exigé
//     (décision produit 2026-08-27) : les deux décomptes voyagent dans le
//     payload, le staff arbitre.
// Un tournoi complet reste un non. Un tournoi REGROUPÉ (`pooled_teams`) ne
// s'atteint que par l'inscription individuelle : l'équipe n'y est pas
// rattachée.

import { emitBotEvent } from '@/utils/botEvents';
import { isNonPlayingTeamRole } from '@/utils/teams/addMember';
import type { RegistrationAnswers } from '@/utils/registrationFields';
import type { CreatedMember, InvitedMember } from '../schemas';
import {
  countTournamentStageTeams,
  insertRegistrationApplication,
  insertStageTeams,
  listTournamentStageIds,
  readTournamentForAutoRegistration,
  upsertTournamentTeam,
  type CreatedTeamRow,
  type TournamentForAutoRegistration,
} from '../repository/teamCreation';
import type { OnboardingCtx } from './context';

export type TournamentOutcome = {
  registration: { tournament_name: string; stages_count: number } | null;
  application: { tournament_name: string; demande_id: string | null } | null;
  /**
   * Inscription individuelle : une « équipe » d'une joueuse ne déclenche pas
   * le provisionnement Discord (cf. l'annonce `team.created`). Lu dès que le
   * tournoi est trouvé, quel que soit son statut.
   */
  solo: boolean;
};

const NONE: TournamentOutcome = {
  registration: null,
  application: null,
  solo: false,
};

type Args = {
  tournamentId: string;
  team: CreatedTeamRow;
  inserted: CreatedMember[];
  invited: InvitedMember[];
  creatorUserId: string | null;
  creatorEmail: string | null;
  answers: RegistrationAnswers;
};

async function registerDirectly(
  ctx: OnboardingCtx,
  tournament: TournamentForAutoRegistration,
  args: Args
): Promise<TournamentOutcome['registration']> {
  const { team, tournamentId } = args;
  const stageIds = await listTournamentStageIds(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (stageIds.length === 0) return null;
  const { error } = await insertStageTeams(
    ctx.db,
    ctx.tenantId,
    team.id,
    stageIds
  );
  if (error) {
    ctx.logger.error(
      '[create-with-member] NEEDS_REVIEW tournament registration failed',
      { teamId: team.id, tournamentId, error: error.message }
    );
    return null;
  }
  // Table d'inscription canonique : statut + réponses aux champs custom.
  try {
    const { error: ttError } = await upsertTournamentTeam(ctx.db, {
      tenant_id: ctx.tenantId,
      tournament_id: tournamentId,
      team_id: team.id,
      field_values: args.answers,
    });
    if (ttError) {
      ctx.logger.error(
        '[create-with-member] NEEDS_REVIEW tournament_teams upsert failed',
        { teamId: team.id, tournamentId, error: ttError.message }
      );
    }
  } catch (ttErr) {
    ctx.logger.error(
      '[create-with-member] NEEDS_REVIEW tournament_teams upsert crash',
      {
        teamId: team.id,
        tournamentId,
        error: ttErr instanceof Error ? ttErr.message : String(ttErr),
      }
    );
  }
  return { tournament_name: tournament.name, stages_count: stageIds.length };
}

async function applyForRegistration(
  ctx: OnboardingCtx,
  tournament: TournamentForAutoRegistration,
  args: Args & { creatorUserId: string },
  counts: { confirmed: number; declared: number; min: number }
): Promise<TournamentOutcome['application']> {
  const { team, tournamentId, creatorUserId } = args;
  const { demandeId, error } = await insertRegistrationApplication(
    ctx.db,
    ctx.tenantId,
    {
      user_id: creatorUserId,
      team_id: team.id,
      tournament_id: tournamentId,
      payload: {
        team_name: team.name,
        tournament_name: tournament.name,
        user_email: args.creatorEmail,
        field_values: args.answers,
        // Trace pour le staff : déposée par le wizard, avec les décomptes.
        auto_from_team_create: true,
        confirmed_players: counts.confirmed,
        declared_players: counts.declared,
        min_players: counts.min || null,
      },
    }
  );
  if (error) {
    ctx.logger.error(
      '[create-with-member] NEEDS_REVIEW tournament application failed',
      { teamId: team.id, tournamentId, error: error.message }
    );
    return null;
  }
  void emitBotEvent(
    'registration.new',
    {
      demande_id: demandeId,
      team_id: team.id,
      team_name: team.name,
      tournament_id: tournamentId,
      tournament_name: tournament.name,
      captain_user_id: creatorUserId,
    },
    ctx.tenantId
  ).catch((err) =>
    ctx.logger.warn('[create-with-member] registration.new emit failed', err)
  );
  return { tournament_name: tournament.name, demande_id: demandeId };
}

export async function attachToTournament(
  ctx: OnboardingCtx,
  args: Args
): Promise<TournamentOutcome> {
  const { team, tournamentId } = args;
  let solo = false;
  try {
    const tournament = await readTournamentForAutoRegistration(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    solo = tournament?.solo_mode === true;
    if (
      !tournament ||
      tournament.status !== 'published' ||
      tournament.pooled_teams === true
    ) {
      return { ...NONE, solo };
    }

    // `min_players` compte les JOUEUSES : l'encadrement ne remplit pas.
    const confirmed = args.inserted.filter(
      (m) => !isNonPlayingTeamRole(m.role)
    ).length;
    const invitedPlayers = args.invited.filter(
      (i) => i.invitation_id && !isNonPlayingTeamRole(i.role)
    ).length;
    const min = Number(tournament.min_players) || 0;

    const full = tournament.max_teams
      ? (await countTournamentStageTeams(ctx.db, ctx.tenantId, tournamentId)) >=
        tournament.max_teams
      : false;
    const canRegister = !full && confirmed >= min;
    const canApply = !full && !canRegister;

    if (canRegister) {
      return {
        ...NONE,
        solo,
        registration: await registerDirectly(ctx, tournament, args),
      };
    }
    if (canApply && args.creatorUserId) {
      return {
        ...NONE,
        solo,
        application: await applyForRegistration(
          ctx,
          tournament,
          { ...args, creatorUserId: args.creatorUserId },
          { confirmed, declared: confirmed + invitedPlayers, min }
        ),
      };
    }
    return { ...NONE, solo };
  } catch (err) {
    ctx.logger.error(
      '[create-with-member] NEEDS_REVIEW tournament registration crash',
      {
        teamId: team.id,
        tournamentId,
        error: err instanceof Error ? err.message : String(err),
      }
    );
    return { ...NONE, solo };
  }
}
