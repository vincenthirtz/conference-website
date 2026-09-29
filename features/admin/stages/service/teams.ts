// features/admin/stages/service/teams.ts — équipes inscrites à une phase :
// liste, ajout (avec avertissements de roster), seeds (unitaire / en lot),
// retrait (unitaire / en lot, slots des matchs vidés sans casser le bracket).
//
// Journal : slug `manage_team`, verbe précis dans `payload.action` (origine).
//
// Isolation : à l'ajout, `teamId` est recoupé avec l'espace du staff AVANT
// l'insertion (équipe d'un autre espace → 404, rien d'écrit).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { countPlayingMembers } from '@/utils/teams/roleKind';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { fail, stageNotFound } from './common';

type Body = Record<string, unknown>;

async function loadStage(ctx: ServiceContext, stageId: string) {
  const { row, error } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (error || !row) throw stageNotFound();
  return row;
}

function teamsAudit(stageId: string, tournamentId: string, payload: Body) {
  return {
    entity_type: 'stage_teams',
    entity_id: stageId,
    tournament_id: tournamentId,
    payload,
  };
}

export async function listStageTeams(ctx: ServiceContext, stageId: string) {
  const s = await loadStage(ctx, stageId);
  const tournament = await related.tournamentSummary(
    ctx.db,
    ctx.tenantId,
    s.tournament_id
  );

  const { rows, error } = await stages.stageTeamsDetailed(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (error) {
    ctx.logger.error('GET stage teams error:', error);
    throw fail(500, 'Failed to fetch stage teams');
  }

  return {
    stageId,
    // Même sous-ensemble que la lecture d'origine.
    stage: {
      id: s.id,
      tournament_id: s.tournament_id,
      name: s.name,
      stage_type: s.stage_type,
    },
    tournament: tournament ?? null,
    teams: rows || [],
  };
}

export async function addStageTeam(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { teamId, seed } = body;
  if (!teamId || typeof teamId !== 'string') throw fail(400, 'Missing teamId');

  const stage = await loadStage(ctx, stageId);

  const { ids: knownTeam, error: teamErr } = await related.existingTeamIds(
    ctx.db,
    ctx.tenantId,
    [teamId]
  );
  if (teamErr) throw fail(500, 'Failed to verify team');
  if (!knownTeam.includes(teamId)) throw fail(404, 'Team not found');

  // --- Contrôles de roster (avertissements, jamais bloquants) ---
  const warnings: string[] = [];
  const [tournament, members] = await Promise.all([
    related.tournamentMinPlayers(ctx.db, ctx.tenantId, stage.tournament_id),
    related.teamMembers(ctx.db, ctx.tenantId, teamId),
  ]);
  // `min_players` porte sur les JOUEUSES : coach et manager n'en tiennent pas lieu.
  const memberCount = countPlayingMembers(members);

  if (tournament?.min_players && memberCount < tournament.min_players) {
    warnings.push(
      `Roster incomplet : ${memberCount} joueur(s) sur ${tournament.min_players} minimum requis`
    );
  }

  if (members.length > 0) {
    const memberUserIds = members
      .map((m) => m.user_id)
      .filter(Boolean) as string[];
    if (memberUserIds.length > 0) {
      const stageIds = await stages.stageIdsOfTournament(
        ctx.db,
        ctx.tenantId,
        stage.tournament_id
      );
      if (stageIds.length > 0) {
        const otherTeamIds = [
          ...new Set(
            await stages.teamIdsInStages(ctx.db, ctx.tenantId, stageIds, teamId)
          ),
        ];
        if (otherTeamIds.length > 0) {
          const dup = await related.overlappingMembers(
            ctx.db,
            ctx.tenantId,
            otherTeamIds,
            memberUserIds
          );
          if (dup && dup.length > 0) {
            const duplicates = (
              dup as unknown as {
                user_id: string;
                team_id: string;
                teams: Relation<{ name: string }>;
              }[]
            ).map((d) => {
              const teamName = oneRelation(d.teams)?.name;
              return `user_id=${d.user_id} (équipe: ${teamName || d.team_id})`;
            });
            warnings.push(
              `Joueur(s) déjà inscrit(s) dans une autre équipe du tournoi : ${duplicates.join(', ')}`
            );
          }
        }
      }
    }
  }

  const { row, error } = await stages.insertStageTeam(ctx.db, {
    tenant_id: ctx.tenantId,
    stage_id: stageId,
    team_id: teamId,
    seed: typeof seed === 'number' ? seed : null,
    is_substitute: false,
    notes: null,
  });
  if (error) {
    ctx.logger.error('POST stage team error:', error);
    throw fail(500, 'Failed to add team to stage');
  }

  return {
    result: { stageTeam: row, ...(warnings.length > 0 ? { warnings } : {}) },
    audit: teamsAudit(stageId, stage.tournament_id, {
      action: 'add',
      teamId,
      seed,
      warnings,
    }),
  };
}

const toSeed = (v: unknown) =>
  v === null || v === undefined ? null : Number(v);

export async function updateStageTeamSeeds(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { teamId, seed, seeds } = body;
  const stage = await loadStage(ctx, stageId);

  if (Array.isArray(seeds)) {
    const results: Array<{ teamId: string; success: boolean; error?: string }> =
      [];
    for (const entry of seeds) {
      if (!entry.teamId || typeof entry.teamId !== 'string') {
        results.push({
          teamId: entry.teamId,
          success: false,
          error: 'Invalid teamId',
        });
        continue;
      }
      const { error } = await stages.updateStageTeamSeed(
        ctx.db,
        ctx.tenantId,
        stageId,
        entry.teamId,
        toSeed(entry.seed)
      );
      results.push(
        error
          ? { teamId: entry.teamId, success: false, error: error.message }
          : { teamId: entry.teamId, success: true }
      );
    }
    return {
      result: { bulk: true, results },
      audit: teamsAudit(stageId, stage.tournament_id, {
        action: 'bulk_seed',
        count: seeds.length,
        seeds,
      }),
    };
  }

  if (!teamId || typeof teamId !== 'string') throw fail(400, 'Missing teamId');

  const seedVal = toSeed(seed);
  const { row, error } = await stages.updateStageTeamSeedReturning(
    ctx.db,
    ctx.tenantId,
    stageId,
    teamId,
    seedVal
  );
  if (error) {
    ctx.logger.error('PATCH stage team error:', error);
    throw fail(500, 'Failed to update seed');
  }

  return {
    result: { stageTeam: row },
    audit: teamsAudit(stageId, stage.tournament_id, {
      action: 'update_seed',
      teamId,
      seed: seedVal,
    }),
  };
}

export async function removeStageTeams(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const { teamId, teamIds } = body;
  const stage = await loadStage(ctx, stageId);

  const idsToRemove: string[] =
    Array.isArray(teamIds) && teamIds.length > 0
      ? teamIds
      : teamId && typeof teamId === 'string'
        ? [teamId]
        : [];
  if (idsToRemove.length === 0) throw fail(400, 'Missing teamId or teamIds');

  // Slots vidés plutôt que matchs supprimés (structure du bracket gardée).
  const [cleanT1, cleanT2] = await matches.clearTeamSlots(
    ctx.db,
    ctx.tenantId,
    stageId,
    idsToRemove
  );
  if (cleanT1.error)
    ctx.logger.error('cleanup matches team1 error:', cleanT1.error);
  if (cleanT2.error)
    ctx.logger.error('cleanup matches team2 error:', cleanT2.error);

  const { error } = await stages.deleteStageTeams(
    ctx.db,
    ctx.tenantId,
    stageId,
    idsToRemove
  );
  if (error) {
    ctx.logger.error('DELETE stage teams error:', error);
    throw fail(500, 'Failed to remove teams');
  }

  const isBulk = Array.isArray(teamIds) && teamIds.length > 0;
  return {
    result: {
      success: true,
      ...(isBulk ? { removed: idsToRemove.length } : {}),
    },
    audit: teamsAudit(
      stageId,
      stage.tournament_id,
      isBulk
        ? { action: 'bulk_remove', teamIds: idsToRemove }
        : { action: 'remove', teamId: idsToRemove[0] }
    ),
  };
}
