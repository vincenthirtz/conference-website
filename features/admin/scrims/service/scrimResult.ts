// features/admin/scrims/service/scrimResult.ts — le staff saisit (ou corrige)
// le score d'un scrim : POST /api/admin/scrims/[scrimId]/result.
//
// Pourquoi une route à part plutôt qu'un champ de plus au PATCH : un résultat
// de scrim ne naissait QUE de l'accord des deux capitaines. Deux cas restaient
// sans issue : un scrim contre une équipe EXTÉRIEURE (sans capitaine), et un
// scrim `disputed` que le staff pouvait rouvrir, pas trancher.
//
// EFFETS DE BORD (score FINAL), alignés sur une clôture par accord des
// capitaines — la logique vit dans les utils partagés avec la route joueuse :
//   1. écriture `completed` + scores + vainqueur (nul permis), conditionnelle
//      au statut lu (409 `SCRIM_CHANGED`) — `applyStaffScrimResult`, qui
//      aligne aussi le miroir noté (rating Glicko + saison + récompenses TCG,
//      clées sur le scrim : une correction ne paie jamais deux fois) ;
//   2. purge des reports capitaines, APRÈS l'écriture ;
//   3. `scrim.finished` au bot — UNE fois : pas sur une correction ;
//   4. journal staff avec l'avant / l'après (écrit par `defineAdminRoute`).
//
// SCORE EN COURS (`final: false`) : met à jour le score SANS clore le scrim,
// seulement depuis scheduled / running ; un `scheduled` passe `running`
// (annonce `scrim.starting`, miroir noté réaligné).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  NotFoundError,
} from '@/utils/admin/errors';
import { emitScrimEvent } from '@/utils/scrimEvents';
import {
  applyStaffLiveScore,
  applyStaffScrimResult,
  STAFF_SCRIM_LIVE_STATUSES,
  STAFF_SCRIM_RESULT_STATUSES,
} from '@/utils/scrims/scrimResult';
import { syncScrimRatedMatch } from '@/utils/scrims/ratedMatch';
import {
  purgeScoreReports,
  type PurgedScoreReport,
} from '@/utils/matches/scoreReports';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/scrims';
import { ScrimResultBody } from '../schemas';

type ScrimBefore = NonNullable<
  Awaited<ReturnType<typeof repo.getScrimForResult>>['row']
>;

/** Échec d'un util `{ ok: false, status, error, code? }`, code historique gardé. */
function utilError(failed: {
  status: number;
  error: string;
  code?: string;
}): LegacyAdminError {
  return new LegacyAdminError(failed.status, failed.error, {
    code: failed.code,
  });
}

export async function recordScrimResult(
  ctx: ServiceContext,
  scrimId: string,
  rawBody: unknown
): Promise<Audited<FinalResult | LiveResult>> {
  const parsedBody = ScrimResultBody.safeParse(rawBody ?? {});
  if (!parsedBody.success) {
    throw new LegacyAdminError(
      400,
      'Scores invalides : deux entiers entre 0 et 99 attendus.',
      { code: 'INVALID_BODY' }
    );
  }
  const {
    team1_score: team1Score,
    team2_score: team2Score,
    final: isFinal = true,
  } = parsedBody.data;

  const { row: before, error: readErr } = await repo.getScrimForResult(
    ctx.db,
    ctx.tenantId,
    scrimId
  );
  if (readErr) {
    ctx.logger.error('[admin/scrims/:id/result] read error', readErr);
    throw new AdminError(500, 'internal', 'Erreur de lecture du scrim.');
  }
  if (!before) throw new NotFoundError('Scrim introuvable.');

  if (!STAFF_SCRIM_RESULT_STATUSES.has(before.status)) {
    throw new LegacyAdminError(
      409,
      'Scrim annulé : réinstaure-le (statut) avant de saisir un résultat.',
      { code: 'SCRIM_CANCELLED' }
    );
  }
  if (!before.team1_id || !before.team2_id) {
    throw new LegacyAdminError(
      400,
      'Scrim incomplet (équipes non assignées).',
      { code: 'SCRIM_TEAMS_MISSING' }
    );
  }

  if (!isFinal) return recordLiveScore(ctx, before, team1Score, team2Score);

  const applied = await applyStaffScrimResult(
    ctx.tenantId,
    { id: scrimId, team1_id: before.team1_id, team2_id: before.team2_id },
    before.status,
    team1Score,
    team2Score
  );
  if (!applied.ok) throw utilError(applied);

  // Purge APRÈS l'écriture : le statut d'arrivée `completed` est refusé par la
  // route de report (SCRIM_CLOSED), aucun report ne peut plus clore ni mettre
  // en litige ce scrim. C'est de l'hygiène : un échec est loggé mais ne défait
  // pas un résultat déjà persisté.
  let purgedReports: PurgedScoreReport[] = [];
  let reportsPurged = true;
  const purge = await purgeScoreReports('scrim', ctx.tenantId, scrimId);
  if (purge.ok) {
    purgedReports = purge.purged;
  } else {
    reportsPurged = false;
    ctx.logger.error('[admin/scrims/:id/result] purge failed', purge.error);
  }

  const wasCompleted = before.status === 'completed';
  // Une correction qui retire ou change un vainqueur DÉJÀ noté n'est pas
  // re-notée incrémentalement : on le signale pour que l'interface propose le
  // rebuild du classement. Un nul corrigé en victoire n'est pas concerné.
  const ratingRebuildAdvised =
    wasCompleted &&
    before.winner_team_id !== null &&
    before.winner_team_id !== applied.winnerTeamId;

  // `scrim.finished` est une ANNONCE : elle part à la clôture, pas à chaque
  // correction — même règle que le PATCH.
  if (!wasCompleted) {
    void emitScrimEvent(
      'scrim.finished',
      applied.scrim as unknown as Parameters<typeof emitScrimEvent>[1],
      ctx.tenantId,
      {
        previousStatus: before.status,
        team1Score,
        team2Score,
        winnerTeamId: applied.winnerTeamId,
        ranked: before.ranked !== false,
        decidedBy: 'staff',
      }
    );
  }

  return {
    result: {
      success: true as const,
      scrim: applied.scrim,
      winner_team_id: applied.winnerTeamId,
      correction: wasCompleted,
      purged_reports: purgedReports.length,
      rating_rebuild_advised: ratingRebuildAdvised,
    },
    audit: {
      entity_type: 'scrim',
      entity_id: scrimId,
      tournament_id: null,
      payload: {
        subject: 'scrim_result',
        before: {
          status: before.status,
          team1_score: before.team1_score,
          team2_score: before.team2_score,
          winner_team_id: before.winner_team_id,
          dispute_reason: before.dispute_reason,
        },
        after: {
          status: 'completed',
          team1_score: team1Score,
          team2_score: team2Score,
          winner_team_id: applied.winnerTeamId,
        },
        correction: wasCompleted,
        purged_reports: purgedReports,
        ...(reportsPurged ? {} : { purge_failed: true }),
      },
    },
  } satisfies Audited<unknown>;
}

type FinalResult = {
  success: true;
  scrim: Record<string, unknown>;
  winner_team_id: string | null;
  correction: boolean;
  purged_reports: number;
  rating_rebuild_advised: boolean;
};

type LiveResult = {
  success: true;
  live: true;
  started: boolean;
  scrim: Record<string, unknown>;
};

/** `final: false` : score en cours, le scrim reste ouvert. */
async function recordLiveScore(
  ctx: ServiceContext,
  before: ScrimBefore,
  team1Score: number,
  team2Score: number
) {
  if (!STAFF_SCRIM_LIVE_STATUSES.has(before.status)) {
    throw new LegacyAdminError(
      409,
      'Score en cours impossible : ce scrim est clos, en litige ou en brouillon. Saisis le résultat final.',
      { code: 'SCRIM_NOT_LIVE' }
    );
  }

  const applied = await applyStaffLiveScore(
    ctx.tenantId,
    before.id,
    before.status,
    team1Score,
    team2Score
  );
  if (!applied.ok) throw utilError(applied);

  // Passage scheduled → running : mêmes suites qu'un changement de statut par
  // le PATCH (annonce `scrim.starting`, miroir noté réaligné — neutre tant que
  // le scrim n'est pas clos). Une simple mise à jour de score n'annonce rien.
  if (applied.started) {
    void emitScrimEvent(
      'scrim.starting',
      applied.scrim as unknown as Parameters<typeof emitScrimEvent>[1],
      ctx.tenantId,
      { previousStatus: before.status }
    );
    await syncScrimRatedMatch(ctx.tenantId, before.id);
  }

  return {
    result: {
      success: true as const,
      live: true as const,
      started: applied.started,
      scrim: applied.scrim,
    },
    audit: {
      entity_type: 'scrim',
      entity_id: before.id,
      tournament_id: null,
      payload: {
        subject: 'scrim_live_score',
        before: {
          status: before.status,
          team1_score: before.team1_score,
          team2_score: before.team2_score,
        },
        after: {
          status: applied.started ? 'running' : before.status,
          team1_score: team1Score,
          team2_score: team2Score,
        },
      },
    },
  } satisfies Audited<unknown>;
}
