// features/admin/teams/service/tournaments.ts — inscriptions d'une équipe aux
// tournois (`/api/admin/teams/[teamId]/tournaments`).
//
// GET    : tournois publiés, séparés en « inscrite » / « disponibles », avec
//          l'effectif JOUANT (l'écran prévient d'une équipe incomplète).
// POST   : inscrit. Écrit les DEUX tables : `tournament_teams` (inscription
//          canonique, lue partout) et `stage_teams` (seeding des phases).
//          `min_players` n'y fait pas obstacle — le staff arbitre (décision
//          produit 2026-08-27) ; l'écart est tracé au journal.
// DELETE : désinscrit des deux tables.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { countPlayingMembers } from '@/utils/teams/roleKind';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { Audited } from '../../_shared/audited';
import * as registrations from '../repository/registrations';
import * as teams from '../repository/teams';
import { fail } from './common';

type StageRegistration = {
  stageId: string;
  stageName?: string;
  stageType?: string | null;
};

/** Recopie du `.select()` imbriqué (repository). */
type TeamStageRegistrationRow = {
  stage_id: string;
  team_id: string;
  tournament_stages: Relation<{
    id: string;
    tournament_id: string;
    name: string;
    stage_type: string | null;
    tournaments: Relation<{
      id: string;
      name: string;
      slug: string | null;
      game: string | null;
      status: string;
      start_date: string | null;
      end_date: string | null;
    }>;
  }>;
};

/** L'équipe DANS l'espace, sinon 404 (commun aux trois méthodes). */
async function loadTeam(ctx: ServiceContext, teamId: string) {
  const { row, error } = await teams.getTeamNameSingle(
    ctx.db,
    ctx.tenantId,
    teamId
  );
  if (error || !row) throw fail(404, 'Team not found');
  return row;
}

/** Erreur inattendue → le 500 historique de la route. */
function internal(ctx: ServiceContext, label: string, err: unknown): never {
  if (err instanceof LegacyAdminError) throw err;
  ctx.logger.error(
    `${label} /api/admin/teams/[teamId]/tournaments error:`,
    err
  );
  throw fail(500, 'Internal server error');
}

export async function getTeamTournaments(ctx: ServiceContext, teamId: string) {
  await loadTeam(ctx, teamId);
  try {
    const { rows: allTournaments, error: tournamentsError } =
      await registrations.listPublishedTournaments(ctx.db, ctx.tenantId);
    if (tournamentsError) throw tournamentsError;

    // Effectif JOUANT (coachs et managers exclus).
    const { rows: memberRows } = await teams.listTeamMemberRoles(
      ctx.db,
      ctx.tenantId,
      teamId
    );
    const playerCount = countPlayingMembers(memberRows);

    const { rows: regs, error: registrationsError } =
      await registrations.listTeamStageRegistrations(
        ctx.db,
        ctx.tenantId,
        teamId
      );
    if (registrationsError) throw registrationsError;

    const registeredTournamentIds = new Set<string>();
    const tournamentRegistrations: Record<string, StageRegistration[]> = {};

    for (const reg of regs as unknown as TeamStageRegistrationRow[]) {
      // Double embed : objet OU tableau aux deux niveaux.
      const stage = oneRelation(reg.tournament_stages);
      const tournament = stage ? oneRelation(stage.tournaments) : null;
      if (!tournament) continue;
      registeredTournamentIds.add(tournament.id);
      if (!tournamentRegistrations[tournament.id]) {
        tournamentRegistrations[tournament.id] = [];
      }
      tournamentRegistrations[tournament.id].push({
        stageId: reg.stage_id,
        stageName: stage?.name,
        stageType: stage?.stage_type,
      });
    }

    const registered = allTournaments
      .filter((t) => registeredTournamentIds.has(t.id))
      .map((t) => ({ ...t, stages: tournamentRegistrations[t.id] || [] }));
    const available = allTournaments.filter(
      (t) => !registeredTournamentIds.has(t.id)
    );

    return { teamId, playerCount, registered, available };
  } catch (err: unknown) {
    return internal(ctx, 'GET', err);
  }
}

export async function registerTeamToTournament(
  ctx: ServiceContext,
  teamId: string,
  body: Record<string, unknown>
) {
  const team = await loadTeam(ctx, teamId);
  const { tournamentId, stageId } = body;
  if (!tournamentId || typeof tournamentId !== 'string') {
    throw fail(400, 'tournamentId required');
  }

  try {
    const { row: tournament, error: tournamentError } =
      await registrations.getTournamentForRegistration(
        ctx.db,
        ctx.tenantId,
        tournamentId
      );
    if (tournamentError || !tournament) {
      throw fail(404, 'Tournament not found');
    }
    if (tournament.status !== 'published') {
      throw fail(400, 'Tournament must be published to register a team');
    }

    // Compté pour le journal : l'écart au roster requis se relit après coup.
    const { rows: playingRows, error: countPlayersError } =
      await teams.listTeamMemberRoles(ctx.db, ctx.tenantId, teamId);
    if (countPlayersError) throw countPlayersError;
    const playerCount = countPlayingMembers(playingRows);

    if (tournament.max_teams) {
      const { rows: existingTeams, error: countError } =
        await registrations.listTournamentStageTeams(
          ctx.db,
          ctx.tenantId,
          tournamentId
        );
      if (countError) throw countError;
      const uniqueTeams = new Set(existingTeams.map((t) => t.team_id));
      if (uniqueTeams.size >= tournament.max_teams) {
        throw fail(
          400,
          `Tournament has reached the limit of ${tournament.max_teams} teams`
        );
      }
    }

    let targetStageIds: string[];
    if (stageId) {
      const { row: stage, error: stageError } =
        await registrations.getTournamentStage(
          ctx.db,
          ctx.tenantId,
          tournamentId,
          stageId as string
        );
      if (stageError || !stage) {
        throw fail(404, 'Stage not found for this tournament');
      }
      targetStageIds = [stageId as string];
    } else {
      const { rows: stages, error: stagesError } =
        await registrations.listTournamentStageIds(
          ctx.db,
          ctx.tenantId,
          tournamentId
        );
      if (stagesError) throw stagesError;
      if (!stages || stages.length === 0) {
        throw fail(400, 'Tournament has no stages. Create a stage first.');
      }
      targetStageIds = stages.map((s) => s.id);
    }

    const { rows: existingRegistrations, error: existingError } =
      await registrations.listTeamStageRows(
        ctx.db,
        ctx.tenantId,
        teamId,
        targetStageIds
      );
    if (existingError) throw existingError;
    if (existingRegistrations && existingRegistrations.length > 0) {
      throw fail(400, 'Team is already registered for this tournament');
    }

    const { rows: inserted, error: insertError } =
      await registrations.insertStageTeams(
        ctx.db,
        targetStageIds.map((stgId) => ({
          tenant_id: ctx.tenantId,
          stage_id: stgId,
          team_id: teamId,
        }))
      );
    if (insertError) throw insertError;

    // `tournament_teams` = inscription CANONIQUE (page publique, espace
    // équipe, plafond max_teams) : sans elle, l'inscription est invisible.
    const { error: ttError } = await registrations.upsertTournamentTeam(
      ctx.db,
      {
        tenant_id: ctx.tenantId,
        tournament_id: tournamentId,
        team_id: teamId,
        status: 'registered',
      }
    );
    if (ttError) {
      // Pas de rollback de `stage_teams`, mais on le DIT.
      ctx.logger.error(
        '[admin/teams/tournaments] tournament_teams upsert failed',
        { teamId, tournamentId, error: ttError.message }
      );
      throw fail(
        500,
        "L'équipe a été seedée dans les phases mais son inscription n'a pas pu être enregistrée. Réessaie ou préviens un dev."
      );
    }

    // Actualité automatique : l'équipe rejoint le tournoi (best-effort).
    try {
      const newsSlug = `tournament-${tournamentId}-team-${teamId}-${Date.now().toString(36)}`;
      const teamData = await teams.getTeamLogo(ctx.db, ctx.tenantId, teamId);
      await teams.insertNews(ctx.db, {
        tenant_id: ctx.tenantId,
        title: `${team.name} rejoint le tournoi ${tournament.name}`,
        slug: newsSlug,
        tag: 'tournaments',
        excerpt: `${team.name} s'est inscrite au tournoi ${tournament.name}.`,
        content: `L'équipe ${team.name} est désormais inscrite au tournoi ${tournament.name}. Bonne chance !`,
        image_url: teamData?.logo_url ?? null,
        team_id: teamId,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      ctx.logger.error('[admin/teams/tournaments] create news error:', newsErr);
    }

    const out: Audited<{
      success: true;
      message: string;
      registrations: typeof inserted;
    }> = {
      result: {
        success: true,
        message: `Team registered to ${targetStageIds.length} stage(s)`,
        registrations: inserted,
      },
      audit: {
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_registration',
          team_name: team.name,
          tournament_name: tournament.name,
          stage_ids: targetStageIds,
          roster_players: playerCount,
          min_players: tournament.min_players ?? null,
        },
      },
    };
    return out;
  } catch (err: unknown) {
    return internal(ctx, 'POST', err);
  }
}

type UnregisterResult = { success: true; message: string };

export async function unregisterTeamFromTournament(
  ctx: ServiceContext,
  teamId: string,
  body: Record<string, unknown>
): Promise<Audited<UnregisterResult>> {
  const team = await loadTeam(ctx, teamId);
  const { tournamentId } = body;
  if (!tournamentId || typeof tournamentId !== 'string') {
    throw fail(400, 'tournamentId required');
  }

  try {
    const { row: tournament, error: tournamentError } =
      await registrations.getTournamentName(ctx.db, ctx.tenantId, tournamentId);
    if (tournamentError || !tournament) {
      throw fail(404, 'Tournament not found');
    }

    const { rows: stages, error: stagesError } =
      await registrations.listTournamentStageIds(
        ctx.db,
        ctx.tenantId,
        tournamentId
      );
    if (stagesError) throw stagesError;

    if (!stages || stages.length === 0) {
      // Rien de retiré : pas d'entrée de journal (comme l'origine).
      return {
        result: {
          success: true,
          message: 'No stage found for this tournament',
        },
        audit: { skip: true },
      };
    }

    const stageIds = stages.map((s) => s.id);
    const { error: deleteError, count } =
      await registrations.deleteTeamStageRows(
        ctx.db,
        ctx.tenantId,
        teamId,
        stageIds
      );
    if (deleteError) throw deleteError;

    // Pendant du POST : sans ça, l'équipe resterait « inscrite » en public.
    const { error: ttDeleteError } = await registrations.deleteTournamentTeam(
      ctx.db,
      ctx.tenantId,
      teamId,
      tournamentId
    );
    if (ttDeleteError) {
      ctx.logger.error(
        '[admin/teams/tournaments] tournament_teams delete failed',
        { teamId, tournamentId, error: ttDeleteError.message }
      );
      throw fail(
        500,
        "L'équipe a été retirée des phases mais son inscription n'a pas pu être supprimée. Réessaie ou préviens un dev."
      );
    }

    return {
      result: {
        success: true,
        message: `Team unregistered (${count || 0} entry(ies) removed)`,
      },
      audit: {
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_unregistration',
          team_name: team.name,
          tournament_name: tournament.name,
          stage_ids: stageIds,
          deleted_count: count,
        },
      },
    };
  } catch (err: unknown) {
    return internal(ctx, 'DELETE', err);
  }
}
