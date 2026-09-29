// features/player/scrims/service/report.ts — une équipe rapporte le score
// d'un de ses scrims (prérequis du ladder, du Glicko et de la saison pour un
// scrim `ranked` : `applyScrimResult` crée le miroir noté). Déplacé TEL QUEL
// de pages/api/player/scrims/[scrimId]/report (lot P13).
//
//   * un seul report   -> on attend l'adversaire (`awaiting_opponent`) ;
//   * deux concordants -> scrim clos, résultat enregistré (`completed`) ;
//   * deux divergents  -> scrim en litige (`disputed`), arbitrage humain.
//
// UN SCRIM `completed` NE SE RE-RAPPORTE PLUS (correctif du 2026-09-15) :
// c'était la gâchette d'une boucle de récompenses TCG infinies. Une
// contestation passe par le staff.
//
// Droit : permission d'équipe `manage_scrims` (R2), résolue par la route —
// pas le seul `captain_id` comme pour le report de match.

import { LegacyAdminError } from '@/utils/admin/errors';
import { isReportBeforeKickoff } from '@/utils/matches/scoreReports';
import { parseBody } from '@/utils/player/errors';
import {
  applyScrimResult,
  markScrimDisputed,
  reportsAgree,
  type ScrimReport,
} from '@/utils/scrims/scrimResult';
import { emitScrimEvent } from '@/utils/scrimEvents';
import {
  listScrimReports,
  readReportableScrim,
  upsertReport,
} from '../repository/myScrims';
import { ScrimReportBody, type ScrimReportResponse } from '../schemas';
import type { ScrimsTeamCtx } from './context';

/** Un scrim clos ou annulé ne se re-rapporte pas sans le staff. */
const SCRIM_REPORT_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'cancelled',
]);

const fail = (status: number, error: string, code?: string) =>
  new LegacyAdminError(status, error, code ? { code } : {});

export async function reportScrimScore(
  ctx: ScrimsTeamCtx,
  scrimId: string,
  rawBody: unknown
): Promise<ScrimReportResponse> {
  const parsed = parseBody(ScrimReportBody, rawBody, {
    message: 'Scores invalides : deux entiers entre 0 et 99 attendus.',
    code: 'INVALID_BODY',
  });
  if (!parsed.ok) throw fail(400, parsed.body.error, parsed.body.code);
  const { team1Score, team2Score } = parsed.data;
  const { db, tenantId } = ctx;

  const { scrim, error: scrimErr } = await readReportableScrim(
    db,
    tenantId,
    scrimId
  );
  if (scrimErr) {
    ctx.logger.error('[scrim-report] lookup error', scrimErr);
    throw fail(500, 'Erreur de lecture du scrim.');
  }
  if (!scrim) throw fail(404, 'Scrim introuvable.');
  if (SCRIM_REPORT_TERMINAL_STATUSES.has(scrim.status)) {
    throw fail(
      409,
      `Scrim ${scrim.status} : contacte le staff pour le modifier.`,
      'SCRIM_CLOSED'
    );
  }
  if (!scrim.team1_id || !scrim.team2_id) {
    throw fail(400, 'Scrim incomplet (équipes non assignées).');
  }

  // Le camp de l'appelante se déduit de l'équipe qu'elle gère.
  const mySide: 1 | 2 | null =
    ctx.team.teamId === scrim.team1_id
      ? 1
      : ctx.team.teamId === scrim.team2_id
        ? 2
        : null;
  if (!mySide) {
    throw fail(
      403,
      'Ton équipe ne participe pas à ce scrim.',
      'NOT_PARTICIPANT'
    );
  }

  // Pas de report avant l'horaire planifié, sauf scrim lancé (`running`).
  // Évaluée après la participation : un tiers n'apprend pas l'horaire ici.
  if (
    isReportBeforeKickoff({
      status: scrim.status,
      scheduledAt: scrim.scheduled_date,
      startedStatus: 'running',
    })
  ) {
    throw fail(
      409,
      "Le scrim n'a pas encore commencé : le score se rapporte après l'horaire prévu. S'il a été joué en avance, contacte le staff.",
      'SCRIM_NOT_STARTED'
    );
  }

  const { error: upsertErr } = await upsertReport(db, {
    tenant_id: tenantId,
    scrim_id: scrimId,
    team_side: mySide,
    reported_by_auth_user_id: ctx.userId,
    team1_score: team1Score,
    team2_score: team2Score,
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) {
    ctx.logger.error('[scrim-report] upsert error', upsertErr);
    throw fail(500, "Échec de l'enregistrement du report.");
  }

  const { reports: rows, error: reportsErr } = await listScrimReports(
    db,
    tenantId,
    scrimId
  );
  if (reportsErr) {
    ctx.logger.error('[scrim-report] reports read error', reportsErr);
    throw fail(500, 'Erreur de lecture des reports.');
  }

  const reports = rows as ScrimReport[];
  const mine = reports.find((r) => r.team_side === mySide);
  const theirs = reports.find((r) => r.team_side !== mySide);

  if (!theirs || !mine) {
    return { outcome: 'awaiting_opponent', scrimStatus: scrim.status };
  }

  if (!reportsAgree(mine, theirs)) {
    const reason = `Reports divergents : ${mine.team1_score}-${mine.team2_score} vs ${theirs.team1_score}-${theirs.team2_score}.`;
    const disputed = await markScrimDisputed(tenantId, scrimId, reason);
    if (disputed === 'closed') {
      // Clos entre notre lecture et ce report : la bascule a refusé.
      throw fail(
        409,
        'Scrim clos : contacte le staff pour le modifier.',
        'SCRIM_CLOSED'
      );
    }
    return { outcome: 'disputed', scrimStatus: 'disputed', reason };
  }

  const applied = await applyScrimResult(
    tenantId,
    { id: scrimId, team1_id: scrim.team1_id, team2_id: scrim.team2_id },
    team1Score,
    team2Score
  );
  if (!applied.ok) throw fail(applied.status, applied.error, applied.code);

  // Fin du scrim annoncée par le bot (fire-and-forget). `emitScrimEvent`
  // résout team1 / team2 (nom) ; champs historiques conservés.
  void emitScrimEvent(
    'scrim.finished',
    { ...scrim, status: 'completed' } as unknown as Parameters<
      typeof emitScrimEvent
    >[1],
    tenantId,
    {
      team1Id: scrim.team1_id,
      team2Id: scrim.team2_id,
      team1Score,
      team2Score,
      winnerTeamId: applied.winnerTeamId,
      ranked: scrim.ranked !== false,
      decidedBy: 'captains',
    }
  );

  return {
    outcome: 'completed',
    scrimStatus: 'completed',
    winnerTeamId: applied.winnerTeamId,
  };
}
