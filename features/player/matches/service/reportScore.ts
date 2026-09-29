// features/player/matches/service/reportScore.ts — déclaration du score final
// d'un match depuis l'espace joueuse ; pendant WEB de
// /api/bot/v1/matches/[matchId]/report. Déplacé TEL QUEL de la route
// historique (lot P12) : mêmes gardes, mêmes codes, même réconciliation.
//
//   * un seul report présent  -> on attend l'adversaire (rien ne change)
//   * les deux concordent     -> applyMatchScore() finalise (status='finished',
//                                propagation bracket, notifications Discord)
//   * les deux divergent      -> matches.status -> 'disputed' (+ raison auto,
//                                event bot match.disputed, embed staff tournoi)
//
// Re-soumission supportée (upsert idempotent sur (match_id, team_side)) : une
// capitaine peut corriger son report ; s'il rejoint celui de l'adversaire
// alors que le match était 'disputed', la dispute est fermée et
// applyMatchScore est appelé.
//
// Droit de déclarer : service/reportRight.ts (capitaine au sens strict).
//
// Gardes d'intégrité (lot 1, 2026-09-16) — contrat partagé avec l'écran :
//   * 409 MATCH_NOT_STARTED        : coup d'envoi pas encore passé et match
//                                    pas 'ongoing' ;
//   * 400 INVALID_SCORE_FOR_FORMAT : couple impossible pour le BO du match ;
//   * 409 FINALIZATION_IN_PROGRESS : l'autre capitaine finalise au même
//                                    instant (claimFinalization).

import { LegacyAdminError } from '@/utils/admin/errors';
import {
  applyMatchScore,
  MatchFinalizationConflictError,
} from '@/utils/matches/applyScore';
import {
  DISPUTE_UNDER_STAFF_REVIEW,
  DISPUTE_UNDER_STAFF_REVIEW_MESSAGE,
  invalidScoreForFormatMessage,
  isReportBeforeKickoff,
  isScoreValidForBestOf,
  isStaffOpenedDispute,
  resolveSeriesBestOf,
} from '@/utils/matches/scoreReports';
import { notifyScoreReportDispute } from '@/utils/discord';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import * as repo from '../repository';
import { ReportScoreBody } from '../schemas';
import type { MatchesCtx } from './context';
import { REPORT_CLOSED_STATUSES, reportingSide } from './reportRight';
import { z } from 'zod';

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

const MatchIdQuery = z.object({ matchId: z.string().uuid() });

type TeamRel = { id: string; name: string; captain_id: string | null };
type Score = { team1_score: number; team2_score: number };

export type ReportScoreDeps = {
  /** Revalidation ISR des pages du match (a besoin de la réponse HTTP). */
  revalidate: (matchId: string) => Promise<void>;
};

function reportsAgree(a: Score, b: Score): boolean {
  return a.team1_score === b.team1_score && a.team2_score === b.team2_score;
}

/** PostgREST embeds come back object|array depending on FK cardinality. */
function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const fail = (status: number, error: string, code?: string) =>
  new LegacyAdminError(status, error, code ? { code } : {});

const finalizedMessage = (status: string) =>
  `Match deja cloture (status=${status}). Contactez le staff pour modifier.`;

export async function reportScore(
  ctx: MatchesCtx,
  rawQuery: unknown,
  rawBody: unknown,
  deps: ReportScoreDeps
) {
  const { db, tenantId, userId, logger } = ctx;

  // 1) Validation entrée (path + body), messages historiques.
  const parsedQuery = MatchIdQuery.safeParse(rawQuery);
  if (!parsedQuery.success) {
    throw fail(400, 'Identifiant de match invalide.');
  }
  const { matchId } = parsedQuery.data;
  const parsedBody = ReportScoreBody.safeParse(rawBody);
  if (!parsedBody.success) {
    throw fail(
      400,
      'Scores invalides : team1Score et team2Score doivent etre des entiers >= 0.'
    );
  }
  const { team1Score, team2Score } = parsedBody.data;

  // 2) Match + capitaines, scope tenant.
  const { match, error: matchErr } = await repo.readMatchForReport(
    db,
    tenantId,
    matchId
  );
  if (matchErr) {
    logger.error('[player/report-score] match lookup error', matchErr);
    throw fail(500, 'Erreur de lecture du match');
  }
  if (!match) throw fail(404, 'Match introuvable');
  if (match.is_bye) throw fail(400, 'Match marque bye');
  const status = match.status as string;
  if (REPORT_CLOSED_STATUSES.has(status)) {
    throw fail(409, finalizedMessage(status), 'MATCH_FINALIZED');
  }

  const team1 = unwrap(match.team1 as TeamRel | TeamRel[] | null);
  const team2 = unwrap(match.team2 as TeamRel | TeamRel[] | null);
  const tournament = unwrap(
    match.tournament as { id: string; name: string } | null
  );
  if (!team1?.id || !team2?.id) {
    throw fail(400, 'Match incomplet (equipes non assignees)');
  }

  // 3) Le droit de déclarer (reportRight.ts).
  const mySide = reportingSide(userId, team1.captain_id, team2.captain_id);
  if (!mySide) {
    throw fail(
      403,
      "Vous n'etes pas le capitaine d'une des deux equipes de ce match."
    );
  }

  // 3b) Le match a-t-il commencé ? APRÈS le contrôle du droit : un tiers n'a
  // pas à apprendre l'horaire par ce biais.
  if (
    isReportBeforeKickoff({
      status,
      scheduledAt: match.scheduled_at as string | null | undefined,
      startedStatus: 'ongoing',
    })
  ) {
    throw fail(
      409,
      "Le match n'a pas encore commence : le score se rapporte apres le coup d'envoi. S'il a ete joue en avance, demandez au staff de le passer en cours.",
      'MATCH_NOT_STARTED'
    );
  }

  // 3c) Couple de scores cohérent avec le best-of (null = aucune borne).
  const bestOf = resolveSeriesBestOf(match.best_of, match.match_format);
  if (
    bestOf !== null &&
    !isScoreValidForBestOf(team1Score, team2Score, bestOf)
  ) {
    throw fail(
      400,
      invalidScoreForFormatMessage(bestOf),
      'INVALID_SCORE_FOR_FORMAT'
    );
  }

  const opponentSide: 1 | 2 = mySide === 1 ? 2 : 1;

  // 4) Upsert du report de mon équipe.
  const { error: upsertErr } = await repo.upsertScoreReport(db, {
    tenantId,
    matchId,
    side: mySide,
    userId,
    team1Score,
    team2Score,
  });
  if (upsertErr) {
    logger.error('[player/report-score] upsert report error', upsertErr);
    throw fail(500, "Echec de l'enregistrement du report");
  }
  logger.info('[player/report-score] captain score report received', {
    matchId,
    mySide,
    team1Score,
    team2Score,
    captainAuthId: userId,
  });

  // 5) Relire les deux reports après l'upsert.
  const { reports: bothReports, error: reportsErr } =
    await repo.readScoreReports(
      db,
      tenantId,
      matchId,
      'team_side, team1_score, team2_score, reported_at, updated_at'
    );
  if (reportsErr) {
    logger.error('[player/report-score] reports lookup error', reportsErr);
    throw fail(500, 'Erreur de lecture des reports');
  }
  const mine = bothReports?.find((r) => r.team_side === mySide) ?? null;
  const opponent =
    bothReports?.find((r) => r.team_side === opponentSide) ?? null;

  // Cas A : en attente de l'adversaire.
  if (!opponent) {
    return {
      status: 'awaiting_opponent',
      matchId,
      mySide,
      opponentSide,
      myReport: mine,
    };
  }

  // Cas B : les deux concordent -> finalisation.
  if (mine && reportsAgree(mine, opponent)) {
    // Une dispute ouverte par le STAFF ne se referme pas par l'accord des
    // capitaines (elle instruit souvent autre chose que le score).
    if (
      isStaffOpenedDispute({
        status,
        dispute_opened_by: match.dispute_opened_by as string | null,
      })
    ) {
      throw fail(
        409,
        DISPUTE_UNDER_STAFF_REVIEW_MESSAGE,
        DISPUTE_UNDER_STAFF_REVIEW
      );
    }
    // CONDITIONNEL au statut 'disputed' (cf. repository) : deux validations
    // simultanées ne re-finalisent pas un match déjà 'finished'.
    if (status === 'disputed') {
      const { error: clearErr } = await repo.clearCaptainDispute(
        db,
        tenantId,
        matchId
      );
      if (clearErr) {
        logger.error('[player/report-score] clear dispute error', clearErr);
        throw fail(500, 'Echec de la fermeture de la dispute');
      }
    }
    const scrimId = (match.scrim_id as string | null) ?? null;
    try {
      const result = await applyMatchScore({
        tenantId,
        matchId,
        team1Score: mine.team1_score,
        team2Score: mine.team2_score,
        markFinished: true,
        staffId: null,
        propagateBracket: !scrimId,
        // Deux capitaines à la même seconde : une seule finalisation.
        claimFinalization: true,
      });
      await deps.revalidate(matchId);
      return {
        status: 'finalized',
        matchId,
        scrimId,
        team1Score: mine.team1_score,
        team2Score: mine.team2_score,
        winnerTeamId: result.winnerTeamId,
      };
    } catch (e) {
      if (e instanceof MatchFinalizationConflictError) {
        return finalizationConflict(ctx, {
          matchId,
          scrimId,
          team1Score: mine.team1_score,
          team2Score: mine.team2_score,
        });
      }
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[player/report-score] applyMatchScore error', e);
      throw fail(500, `Echec de la finalisation : ${msg}`, 'APPLY_FAILED');
    }
  }

  // Cas C : les deux existent et divergent -> dispute.
  const t1Report = bothReports?.find((r) => r.team_side === 1);
  const t2Report = bothReports?.find((r) => r.team_side === 2);
  if (status !== 'disputed') {
    const reason = [
      `Desaccord capitaines (via site) :`,
      `- ${team1.name} : ${t1Report?.team1_score}-${t1Report?.team2_score}`,
      `- ${team2.name} : ${t2Report?.team1_score}-${t2Report?.team2_score}`,
    ].join('\n');

    // CONDITIONNEL au statut lu : un report tardif ne remet pas en dispute un
    // match clos entre-temps.
    const { row: disputedRow, error: disputeErr } =
      await repo.openCaptainDispute(db, tenantId, matchId, status, reason);
    if (disputeErr) {
      logger.error('[player/report-score] open dispute error', disputeErr);
      throw fail(500, "Echec de l'ouverture de la dispute");
    }
    if (!disputedRow) {
      throw fail(
        409,
        'Le match a change pendant votre report (cloture ou modifie). Rechargez la page ; contactez le staff pour contester.',
        'MATCH_FINALIZED'
      );
    }

    void (async () => {
      const enriched = await enrichMatchEvent(matchId);
      await emitBotEvent(
        'match.disputed',
        {
          matchId,
          tournamentId: (match.tournament_id as string | null) ?? null,
          scrimId: (match.scrim_id as string | null) ?? null,
          previousStatus: status,
          reason,
          openedBy: 'captain',
          openedByStaffId: null,
          enriched,
        },
        tenantId
      );
    })().catch((e) => logger.error('[botEvents] match.disputed emit error', e));
  }

  // Notification Discord staff — uniquement pour les matchs de tournoi.
  if (t1Report && t2Report && !match.scrim_id) {
    void notifyScoreReportDispute({
      matchId,
      tournamentId: (match.tournament_id as string | null) ?? null,
      tournamentName: tournament?.name ?? null,
      team1Name: team1.name ?? 'Equipe 1',
      team2Name: team2.name ?? 'Equipe 2',
      team1Report: {
        team1Score: t1Report.team1_score,
        team2Score: t1Report.team2_score,
      },
      team2Report: {
        team1Score: t2Report.team1_score,
        team2Score: t2Report.team2_score,
      },
      adminUrl: `${SITE_URL.replace(/\/$/, '')}/admin/matches/${matchId}`,
    }).catch((e) =>
      logger.error('[player/report-score] dispute notify error', e)
    );
  }

  return {
    status: 'disputed',
    matchId,
    scrimId: (match.scrim_id as string | null) ?? null,
    mySide,
    myReport: mine,
    opponentReport: opponent,
  };
}

/**
 * La réservation de finalisation a été perdue (cf. applyScore.ts 4c). On
 * relit le match pour dire la vérité plutôt qu'un 500 :
 *   * déjà clos sur CE score         -> 200 'finalized' ;
 *   * clos sur un autre score/statut -> 409 MATCH_FINALIZED ;
 *   * pas encore clos                -> 409 FINALIZATION_IN_PROGRESS.
 */
async function finalizationConflict(
  ctx: MatchesCtx,
  c: {
    matchId: string;
    scrimId: string | null;
    team1Score: number;
    team2Score: number;
  }
) {
  const row = await repo.readMatchOutcome(ctx.db, ctx.tenantId, c.matchId);
  if (
    row?.status === 'finished' &&
    row.team1_score === c.team1Score &&
    row.team2_score === c.team2Score
  ) {
    return {
      status: 'finalized',
      matchId: c.matchId,
      scrimId: c.scrimId,
      team1Score: c.team1Score,
      team2Score: c.team2Score,
      winnerTeamId: row.winner_team_id ?? null,
    };
  }
  if (row && REPORT_CLOSED_STATUSES.has(row.status)) {
    throw fail(409, finalizedMessage(row.status), 'MATCH_FINALIZED');
  }
  ctx.logger.warn('[player/report-score] finalization claim lost', {
    matchId: c.matchId,
    status: row?.status ?? null,
  });
  throw fail(
    409,
    "Le score est en cours de validation par l'autre equipe. Rechargez dans quelques secondes.",
    'FINALIZATION_IN_PROGRESS'
  );
}
