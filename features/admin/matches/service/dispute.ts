// features/admin/matches/service/dispute.ts — litige d'un match : ouverture,
// résolution (avec ou sans nouveau score), annulation.
//
// Tant qu'un match est `disputed`, applyMatchScore et la propagation bracket
// sont bloquées (utils/matches/applyScore.ts, utils/bracket/propagate.ts).
// Le métier reste dans ses utils : impact aval (bracket/disputeImpact),
// score (applyMatchScore), purge des reports (scoreReports), outbox bot,
// régie auto. Messages et codes : ceux de la route d'origine.
//
// Lecture et écriture du match filtrées par tenant (id d'un autre espace →
// 404 « Match not found », rien d'écrit).

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { MatchStatus } from '@/types/admin';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { findDownstreamImpact } from '@/utils/bracket/disputeImpact';
import { purgeScoreReports } from '@/utils/matches/scoreReports';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/matches';
import { withInternalError } from './internal';

type Raw = Record<string, unknown>;

const LABEL = '[/api/admin/matches/[matchId]/dispute] error:';

const VALID_RESUME_STATUSES: MatchStatus[] = [
  'pending',
  'ongoing',
  'finished',
  'walkover',
];

const INVALID_RESUME = `Invalid resumeStatus. Allowed: ${VALID_RESUME_STATUSES.join(', ')}`;

function staffIdOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
}

/** Litige clos : le bot verrouille le fil du forum. */
function emitDisputeResolved(
  ctx: ServiceContext,
  matchId: string,
  tournamentId: string | null,
  fields: {
    resolution: string | null;
    resumeStatus: MatchStatus;
    cancelled: boolean;
  }
) {
  void (async () => {
    const enriched = await enrichMatchEvent(matchId);
    await emitBotEvent(
      'match.dispute.resolved',
      {
        matchId,
        tournamentId,
        resolution: fields.resolution,
        resumeStatus: fields.resumeStatus,
        resolvedByStaffId: staffIdOf(ctx),
        cancelled: fields.cancelled,
        discordDisputeThreadId: enriched?.discordDisputeThreadId ?? null,
      },
      ctx.tenantId
    );
  })().catch((err) =>
    ctx.logger.error('[botEvents] match.dispute.resolved emit error:', err)
  );
}

/* -----------------------------------------------------------------------
 * POST : ouvrir — `{ reason }`
 * --------------------------------------------------------------------- */

export async function openDispute(
  ctx: ServiceContext,
  matchId: string,
  body: Raw
): Promise<Audited<{ match: unknown }>> {
  return withInternalError(ctx, LABEL, async () => {
    const { reason } = body;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new LegacyAdminError(400, 'reason is required');
    }
    if (reason.length > 2000) {
      throw new LegacyAdminError(400, 'reason is too long (max 2000 chars)');
    }

    const { row: match, error: fetchErr } = await repo.getMatchForDispute(
      ctx.db,
      ctx.tenantId,
      matchId,
      'id, tournament_id, status, dispute_reason, dispute_opened_at'
    );
    if (fetchErr || !match) {
      throw new LegacyAdminError(404, 'Match not found');
    }
    if (match.status === 'disputed') {
      throw new LegacyAdminError(
        409,
        "Ce match est deja en dispute. Resolvez-la avant d'en ouvrir une nouvelle.",
        { code: 'ALREADY_DISPUTED' }
      );
    }
    if (match.status === 'cancelled') {
      throw new LegacyAdminError(
        400,
        "Impossible d'ouvrir une dispute sur un match annule."
      );
    }

    // Garde-fou : un match aval déjà démarré dépend de ce résultat → refus.
    const impact = await findDownstreamImpact(ctx.tenantId, matchId);
    if (impact.impacted.length > 0) {
      throw new LegacyAdminError(
        409,
        `Impossible d'ouvrir la dispute : ${impact.impacted.length} match(es) aval(s) déjà joué(s) ou en cours dépendent du résultat.`,
        { code: 'DOWNSTREAM_LOCKED', extra: { blockedBy: impact.impacted } }
      );
    }

    const previousStatus = match.status as MatchStatus;
    const nowIso = new Date().toISOString();
    const staffId = staffIdOf(ctx);

    const { row: updated, error: updErr } =
      await repo.updateMatchReturningInTenant(ctx.db, ctx.tenantId, matchId, {
        status: 'disputed',
        dispute_reason: reason.trim(),
        dispute_opened_by: staffId,
        dispute_opened_at: nowIso,
        // Nouvelle dispute après une résolution : on repart de zéro.
        dispute_resolution: null,
        dispute_resolved_by: null,
        dispute_resolved_at: null,
        updated_at: nowIso,
      });
    if (updErr || !updated) {
      ctx.logger.error('openDispute update error:', updErr);
      throw new LegacyAdminError(500, 'Failed to open dispute');
    }

    // Forum des litiges : noms d'équipes, tournoi, rôles des capitaines.
    void (async () => {
      const enriched = await enrichMatchEvent(matchId);
      await emitBotEvent(
        'match.disputed',
        {
          matchId,
          tournamentId: match.tournament_id ?? null,
          previousStatus,
          reason: reason.trim(),
          openedBy: 'staff',
          openedByStaffId: staffId,
          enriched,
        },
        ctx.tenantId
      );
    })().catch((e) =>
      ctx.logger.error('[botEvents] match.disputed emit error:', e)
    );

    return {
      result: { match: updated },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: { previous_status: previousStatus, reason: reason.trim() },
      },
    };
  });
}

/* -----------------------------------------------------------------------
 * PATCH : résoudre — `{ resolution, resumeStatus?, team1Score?,
 * team2Score?, winnerTeamId?, forfeitTeamId? }`
 * --------------------------------------------------------------------- */

export async function resolveDispute(
  ctx: ServiceContext,
  matchId: string,
  body: Raw
): Promise<Audited<{ match: unknown }>> {
  return withInternalError(ctx, LABEL, async () => {
    if (
      typeof body.resolution !== 'string' ||
      body.resolution.trim().length === 0
    ) {
      throw new LegacyAdminError(400, 'resolution is required');
    }
    if (body.resolution.length > 2000) {
      throw new LegacyAdminError(
        400,
        'resolution is too long (max 2000 chars)'
      );
    }

    const { row: match, error: fetchErr } = await repo.getMatchForDispute(
      ctx.db,
      ctx.tenantId,
      matchId,
      'id, tournament_id, status, team1_id, team2_id, team1_score, team2_score'
    );
    if (fetchErr || !match) {
      throw new LegacyAdminError(404, 'Match not found');
    }
    if (match.status !== 'disputed') {
      throw new LegacyAdminError(409, "Ce match n'est pas en dispute.", {
        code: 'NOT_DISPUTED',
      });
    }

    let resumeStatus: MatchStatus = 'finished';
    if (typeof body.resumeStatus === 'string') {
      if (!VALID_RESUME_STATUSES.includes(body.resumeStatus as MatchStatus)) {
        throw new LegacyAdminError(400, INVALID_RESUME);
      }
      resumeStatus = body.resumeStatus as MatchStatus;
    }

    const hasScoreOverride =
      typeof body.team1Score === 'number' &&
      typeof body.team2Score === 'number';
    const hasForfeit =
      typeof body.forfeitTeamId === 'string' && body.forfeitTeamId.length > 0;

    const nowIso = new Date().toISOString();
    const resolverId = staffIdOf(ctx);
    const trimmedResolution = body.resolution.trim();
    const tournamentId = match.tournament_id ?? null;

    // Cas 1 : nouveau score / forfait → applyMatchScore (propagation).
    if (
      (resumeStatus === 'finished' || resumeStatus === 'walkover') &&
      (hasScoreOverride || hasForfeit)
    ) {
      // applyMatchScore refuse un match disputed : on repasse 'pending' le
      // temps de l'appel, résolution enregistrée au passage.
      const { error: clearErr } = await repo.updateMatchInTenant(
        ctx.db,
        ctx.tenantId,
        matchId,
        {
          status: 'pending',
          dispute_resolution: trimmedResolution,
          dispute_resolved_by: resolverId,
          dispute_resolved_at: nowIso,
          // Un éventuel ré-ouverture repart sur un cycle SLA propre.
          escalation_pinged_at: null,
          updated_at: nowIso,
        }
      );
      if (clearErr) {
        ctx.logger.error('resolveDispute clear status error:', clearErr);
        throw new LegacyAdminError(500, 'Failed to clear dispute status');
      }

      let result: Awaited<ReturnType<typeof applyMatchScore>>;
      try {
        result = await applyMatchScore({
          tenantId: ctx.tenantId,
          matchId,
          team1Score: hasScoreOverride
            ? (body.team1Score as number)
            : undefined,
          team2Score: hasScoreOverride
            ? (body.team2Score as number)
            : undefined,
          winnerTeamId:
            typeof body.winnerTeamId === 'string'
              ? body.winnerTeamId
              : undefined,
          forfeitTeamId: hasForfeit
            ? (body.forfeitTeamId as string)
            : undefined,
          status: resumeStatus,
          markFinished: resumeStatus === 'finished',
          // Une décision de litige peut clore une série incomplète.
          allowIncompleteSeries: true,
          staffId: resolverId,
          propagateBracket: true,
        });
      } catch (e: unknown) {
        // Retour en 'disputed' : la dispute en cours n'est pas perdue.
        await repo.updateMatchInTenant(ctx.db, ctx.tenantId, matchId, {
          status: 'disputed',
          dispute_resolution: null,
          dispute_resolved_by: null,
          dispute_resolved_at: null,
        });
        ctx.logger.error('resolveDispute applyMatchScore error:', e);
        throw new LegacyAdminError(
          500,
          `Erreur lors de l'application du score : ${
            e instanceof Error ? e.message : 'unknown'
          }. La dispute reste ouverte.`
        );
      }

      emitDisputeResolved(ctx, matchId, tournamentId, {
        resolution: trimmedResolution,
        resumeStatus,
        cancelled: false,
      });

      return {
        result: { match: result.match },
        audit: {
          entity_type: 'match',
          entity_id: matchId,
          tournament_id: tournamentId,
          payload: {
            resolution: trimmedResolution,
            resume_status: resumeStatus,
            applied_score: hasScoreOverride
              ? { team1: body.team1Score, team2: body.team2Score }
              : null,
            forfeit_team_id: hasForfeit ? body.forfeitTeamId : null,
          },
          skip: !resolverId,
        },
      };
    }

    // Cas 2 : pas de score — retour au flux normal. Purge des reports
    // capitaines AVANT la réouverture (sinon la gagnante rétablit le score
    // annulé en renvoyant le sien) ; échec → la dispute reste ouverte.
    const purge = await purgeScoreReports('match', ctx.tenantId, matchId);
    if (!purge.ok) {
      throw new LegacyAdminError(
        500,
        `${purge.error} La dispute reste ouverte.`
      );
    }

    const { row: updated, error: updErr } =
      await repo.updateMatchReturningInTenant(ctx.db, ctx.tenantId, matchId, {
        status: resumeStatus,
        dispute_resolution: trimmedResolution,
        dispute_resolved_by: resolverId,
        dispute_resolved_at: nowIso,
        escalation_pinged_at: null,
        updated_at: nowIso,
      });
    if (updErr || !updated) {
      ctx.logger.error('resolveDispute simple update error:', updErr);
      throw new LegacyAdminError(500, 'Failed to resolve dispute');
    }

    emitDisputeResolved(ctx, matchId, tournamentId, {
      resolution: trimmedResolution,
      resumeStatus,
      cancelled: false,
    });

    return {
      result: { match: updated },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: tournamentId,
        payload: {
          resolution: trimmedResolution,
          resume_status: resumeStatus,
          applied_score: null,
          // La purge supprime une donnée : l'audit la conserve.
          purged_reports: purge.purged,
        },
        skip: !resolverId,
      },
    };
  });
}

/* -----------------------------------------------------------------------
 * DELETE : annuler sans résolution — `?resumeStatus=` (défaut pending)
 * --------------------------------------------------------------------- */

export async function cancelDispute(
  ctx: ServiceContext,
  matchId: string,
  rawResumeStatus: unknown
): Promise<Audited<{ match: unknown }>> {
  return withInternalError(ctx, LABEL, async () => {
    let resumeStatus: MatchStatus = 'pending';
    if (typeof rawResumeStatus === 'string') {
      if (!VALID_RESUME_STATUSES.includes(rawResumeStatus as MatchStatus)) {
        throw new LegacyAdminError(400, INVALID_RESUME);
      }
      resumeStatus = rawResumeStatus as MatchStatus;
    }

    const { row: match, error: fetchErr } = await repo.getMatchForDispute(
      ctx.db,
      ctx.tenantId,
      matchId,
      'id, tournament_id, status, dispute_reason'
    );
    if (fetchErr || !match) {
      throw new LegacyAdminError(404, 'Match not found');
    }
    if (match.status !== 'disputed') {
      throw new LegacyAdminError(409, "Ce match n'est pas en dispute.", {
        code: 'NOT_DISPUTED',
      });
    }

    // Mêmes raisons et même ordre que la résolution sans score.
    const purge = await purgeScoreReports('match', ctx.tenantId, matchId);
    if (!purge.ok) {
      throw new LegacyAdminError(
        500,
        `${purge.error} La dispute reste ouverte.`
      );
    }

    const { row: updated, error: updErr } =
      await repo.updateMatchReturningInTenant(ctx.db, ctx.tenantId, matchId, {
        status: resumeStatus,
        dispute_reason: null,
        dispute_opened_by: null,
        dispute_opened_at: null,
        dispute_resolution: null,
        dispute_resolved_by: null,
        dispute_resolved_at: null,
        escalation_pinged_at: null,
        updated_at: new Date().toISOString(),
      });
    if (updErr || !updated) {
      ctx.logger.error('cancelDispute update error:', updErr);
      throw new LegacyAdminError(500, 'Failed to cancel dispute');
    }

    // Verrouillage du fil forum même sans résolution (cancelled=true).
    emitDisputeResolved(ctx, matchId, match.tournament_id ?? null, {
      resolution: null,
      resumeStatus,
      cancelled: true,
    });

    return {
      result: { match: updated },
      audit: {
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: {
          prior_reason: match.dispute_reason,
          resume_status: resumeStatus,
          purged_reports: purge.purged,
        },
      },
    };
  });
}
