// features/admin/matches/service/veto.ts — veto de cartes d'un match
// (ban / pick / decider), réinitialisation et déverrouillage admin.
//
// Veto complet → parties préparées par utils/matches/gamesFromVeto (partagé
// avec l'endpoint bot, n'écrase jamais un score saisi). Notification Discord
// par utils/discord. Messages et codes : ceux de la route d'origine.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { StaffRole } from '@/types/admin';
import { hasAtLeastRole } from '@/utils/staffRoles';
import type { VetoAction, VetoStep } from '@/types/veto';
import { VETO_FLOWS } from '@/types/veto';
import {
  clearGamesFromVeto,
  syncGamesFromVeto,
  type VetoStepLike,
} from '@/utils/matches/gamesFromVeto';
import { notifyVetoStep } from '@/utils/discord';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/veto';
import { withInternalError } from './internal';

type Raw = Record<string, unknown>;
type GamesClient = Parameters<typeof syncGamesFromVeto>[0];

const LABEL = '[/api/admin/matches/[matchId]/veto] error:';
const VALID_ACTIONS: VetoAction[] = ['ban', 'pick', 'decider'];

function flowOf(format: string | null) {
  const f = format || 'bo3';
  return { format: f, flow: VETO_FLOWS[f] || VETO_FLOWS.bo3 };
}

/* ---- GET : état du veto ---- */

export async function getVeto(ctx: ServiceContext, matchId: string) {
  return withInternalError(ctx, LABEL, async () => {
    const match = await repo.getMatchForVeto(ctx.db, ctx.tenantId, matchId);
    if (!match) throw new LegacyAdminError(404, 'Match not found');

    const { rows: steps, error } = await repo.listVetoSteps(
      ctx.db,
      ctx.tenantId,
      matchId
    );
    if (error) {
      ctx.logger.error('GET veto steps error:', error);
      throw new LegacyAdminError(500, 'Failed to fetch veto steps');
    }

    const teamIds = [match.team1_id, match.team2_id].filter(
      (x): x is string => !!x
    );
    const teamNames: Record<string, string> = {};
    if (teamIds.length > 0) {
      for (const t of await repo.listTeamNames(ctx.db, ctx.tenantId, teamIds)) {
        teamNames[t.id] = t.name;
      }
    }

    const { format, flow } = flowOf(match.match_format);
    const vetoSteps = (steps || []) as unknown as VetoStep[];
    const pickedMaps = vetoSteps
      .filter((s) => s.action === 'pick' || s.action === 'decider')
      .map((s) => ({
        map_name: s.map_name,
        map_type: s.map_type,
        picked_by: s.team_id,
      }));

    return {
      matchId,
      format,
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      team1Name: match.team1_id ? teamNames[match.team1_id] || null : null,
      team2Name: match.team2_id ? teamNames[match.team2_id] || null : null,
      flow,
      steps: vetoSteps,
      currentStepIndex: vetoSteps.length,
      isComplete: vetoSteps.length >= flow.length,
      pickedMaps,
      vetoLockedAt: match.veto_locked_at,
    };
  });
}

/* ---- POST : enregistrer une étape ---- */

export async function recordVetoStep(
  ctx: ServiceContext,
  matchId: string,
  body: Raw
): Promise<
  Audited<{ step: VetoStep; isComplete: boolean; gamesCreated: boolean }>
> {
  return withInternalError(ctx, LABEL, async () => {
    const mapName = body.map_name as string;
    if (!mapName) throw new LegacyAdminError(400, 'map_name is required');
    const action = body.action as VetoAction;
    if (!VALID_ACTIONS.includes(action)) {
      throw new LegacyAdminError(400, 'action must be ban, pick, or decider');
    }
    const teamId = (body.team_id as string | null | undefined) ?? null;

    const match = await repo.getMatchForVeto(ctx.db, ctx.tenantId, matchId);
    if (!match) throw new LegacyAdminError(404, 'Match not found');

    // Verrou : pas de veto une fois le match commencé (déverrouillage admin
    // via PATCH { unlock: true }).
    if (match.veto_locked_at) {
      throw new LegacyAdminError(
        409,
        'Le veto est verrouille (match commence ou termine). Un admin peut deverrouiller via PATCH /veto { unlock: true }.',
        { code: 'VETO_LOCKED', extra: { vetoLockedAt: match.veto_locked_at } }
      );
    }

    const { count, error: cErr } = await repo.countVetoSteps(
      ctx.db,
      ctx.tenantId,
      matchId
    );
    if (cErr) throw new LegacyAdminError(500, 'Failed to count veto steps');

    const currentStep = (count ?? 0) + 1;
    const { flow } = flowOf(match.match_format);
    if (currentStep > flow.length) {
      throw new LegacyAdminError(400, 'Veto is already complete');
    }

    const used = await repo.listVetoMaps(ctx.db, ctx.tenantId, matchId);
    if (new Set(used.map((e) => e.map_name)).has(mapName)) {
      throw new LegacyAdminError(
        400,
        'This map has already been used in this veto'
      );
    }

    const { row: step, error } = await repo.insertVetoStep(ctx.db, {
      tenant_id: ctx.tenantId,
      match_id: matchId,
      step_number: currentStep,
      action,
      team_id: teamId,
      map_name: mapName,
      map_type: (body.map_type as string | null | undefined) ?? null,
    });
    if (error || !step) {
      ctx.logger.error('POST veto step error:', error);
      throw new LegacyAdminError(500, 'Failed to record veto step');
    }

    // Veto terminé → parties préparées à partir des cartes retenues.
    const isNowComplete = currentStep >= flow.length;
    let gamesCreated = false;
    if (isNowComplete) {
      const { rows: allSteps } = await repo.listVetoSteps(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      const outcome = await syncGamesFromVeto(ctx.db as GamesClient, {
        tenantId: ctx.tenantId,
        matchId,
        steps: (allSteps ?? []) as VetoStepLike[],
      });
      gamesCreated = outcome.created;
      if (!outcome.created && outcome.reason === 'erreur') {
        ctx.logger.error('[admin/veto] génération des parties impossible');
      }
    }

    void sendVetoStepDiscord(ctx, {
      matchId,
      tournamentId: match.tournament_id ?? null,
      team1Id: match.team1_id ?? null,
      team2Id: match.team2_id ?? null,
      stepNumber: currentStep,
      totalSteps: flow.length,
      action,
      mapName,
      byTeamId: teamId,
      isComplete: isNowComplete,
    }).catch((e) => ctx.logger.error('[discord] notifyVetoStep error:', e));

    return {
      result: {
        step: step as unknown as VetoStep,
        isComplete: isNowComplete,
        gamesCreated,
      },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id,
        payload: {
          step_number: currentStep,
          veto_action: action,
          map_name: mapName,
          team_id: body.team_id,
          is_complete: isNowComplete,
          games_created: gamesCreated,
        },
      },
    };
  });
}

async function sendVetoStepDiscord(
  ctx: ServiceContext,
  p: {
    matchId: string;
    tournamentId: string | null;
    team1Id: string | null;
    team2Id: string | null;
    stepNumber: number;
    totalSteps: number;
    action: VetoAction;
    mapName: string;
    byTeamId: string | null;
    isComplete: boolean;
  }
): Promise<void> {
  const ids = [p.team1Id, p.team2Id, p.byTeamId].filter(
    (id): id is string => !!id
  );
  if (ids.length === 0) return;

  const byId = new Map<string, string>();
  for (const t of await repo.listTeamNames(ctx.db, ctx.tenantId, ids)) {
    byId.set(t.id, t.name);
  }

  await notifyVetoStep({
    tournamentId: p.tournamentId,
    matchId: p.matchId,
    team1Name: p.team1Id ? (byId.get(p.team1Id) ?? 'Équipe 1') : 'Équipe 1',
    team2Name: p.team2Id ? (byId.get(p.team2Id) ?? 'Équipe 2') : 'Équipe 2',
    stepNumber: p.stepNumber,
    totalSteps: p.totalSteps,
    action: p.action,
    mapName: p.mapName,
    byTeamName: p.byTeamId ? (byId.get(p.byTeamId) ?? null) : null,
    isComplete: p.isComplete,
  });
}

/* ---- DELETE : réinitialiser ---- */

export async function resetVeto(
  ctx: ServiceContext,
  matchId: string
): Promise<Audited<unknown>> {
  return withInternalError(ctx, LABEL, async () => {
    const match = await repo.getMatchForVeto(ctx.db, ctx.tenantId, matchId);
    if (!match) throw new LegacyAdminError(404, 'Match not found');
    if (match.veto_locked_at) {
      throw new LegacyAdminError(
        409,
        'Le veto est verrouille. Un admin peut deverrouiller via PATCH /veto { unlock: true } avant de reset.',
        { code: 'VETO_LOCKED', extra: { vetoLockedAt: match.veto_locked_at } }
      );
    }

    const vetoSteps = await repo.listVetoMaps(ctx.db, ctx.tenantId, matchId);

    // Les parties préparées par le veto partent avec lui — JAMAIS celles qui
    // portent un score.
    const cleared = await clearGamesFromVeto(ctx.db as GamesClient, {
      tenantId: ctx.tenantId,
      matchId,
    });

    const { error } = await repo.deleteVetoSteps(ctx.db, ctx.tenantId, matchId);
    if (error) {
      ctx.logger.error('DELETE veto steps error:', error);
      throw new LegacyAdminError(500, 'Failed to reset veto');
    }

    const keptReason = cleared.cleared === null ? cleared.reason : null;
    return {
      result: {
        success: true,
        gamesCleared: cleared.cleared,
        // Parties CONSERVÉES (scores saisis) : l'arbitre doit le savoir.
        gamesKeptReason: keptReason,
      },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id,
        payload: {
          reset: true,
          steps_deleted: vetoSteps.length,
          games_cleared: cleared.cleared,
          games_kept_reason: keptReason,
        },
      },
    };
  });
}

/* ---- PATCH : déverrouillage admin — `{ unlock: true, reason? }` ---- */

export async function unlockMatchVeto(
  ctx: ServiceContext,
  role: StaffRole | null | undefined,
  matchId: string,
  body: Raw
): Promise<Audited<unknown>> {
  return withInternalError(ctx, LABEL, async () => {
    if (body.unlock !== true) {
      throw new LegacyAdminError(
        400,
        'PATCH requiert { unlock: true } (admin only).'
      );
    }
    // Action exceptionnelle, réservée aux admins+ (après la validation du
    // corps, comme à l'origine).
    if (!hasAtLeastRole(role, 'admin')) {
      throw new LegacyAdminError(
        403,
        'Seul un admin peut deverrouiller un veto.'
      );
    }

    const match = await repo.getMatchForVeto(ctx.db, ctx.tenantId, matchId);
    if (!match) throw new LegacyAdminError(404, 'Match not found');
    if (!match.veto_locked_at) {
      return {
        result: { success: true, vetoLockedAt: null, alreadyUnlocked: true },
        audit: { skip: true },
      };
    }

    const { error } = await repo.unlockVeto(ctx.db, ctx.tenantId, matchId);
    if (error) {
      ctx.logger.error('PATCH veto unlock error:', error);
      throw new LegacyAdminError(500, 'Failed to unlock veto');
    }

    return {
      result: { success: true, vetoLockedAt: null },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id,
        payload: {
          unlock: true,
          previous_locked_at: match.veto_locked_at,
          reason:
            typeof body.reason === 'string' && body.reason.trim()
              ? body.reason.trim().slice(0, 500)
              : null,
        },
      },
    };
  });
}
