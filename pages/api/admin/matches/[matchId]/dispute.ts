// pages/api/admin/matches/[matchId]/dispute.ts
// Workflow de dispute pour un match.
//
// POST   : ouvre une dispute (status -> 'disputed')
// PATCH  : resout une dispute (saisie d'une resolution + retour au workflow normal)
// DELETE : annule la dispute sans resolution (revert status au precedent)
//
// Tant qu'un match est en 'disputed', applyMatchScore et la propagation bracket
// sont bloquees (cf. utils/matches/applyScore.ts + utils/bracket/propagate.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyMatchScore } from '@/utils/matches/applyScore';
import type { MatchStatus } from '@/types/admin';

import { logger } from '../../../../../utils/logger';
const VALID_RESUME_STATUSES: MatchStatus[] = [
  'pending',
  'ongoing',
  'finished',
  'walkover',
];

// Ouvrir une dispute = decision sensible : minimum manager.
export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  const id = String(matchId);

  try {
    switch (req.method) {
      case 'POST':
        return await openDispute(id, req, res, ctx);
      case 'PATCH':
        return await resolveDispute(id, req, res, ctx);
      case 'DELETE':
        return await cancelDispute(id, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/matches/[matchId]/dispute] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * POST : ouvrir une dispute
 * Body : { reason: string }
 * Side effects :
 *   - status -> 'disputed'
 *   - dispute_reason / dispute_opened_by / dispute_opened_at
 *   - garde le score actuel (la propagation est bloquee tant que disputed)
 * ---------------------------------------------------------*/

async function openDispute(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { reason } = (req.body || {}) as { reason?: unknown };

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ error: 'reason is required' });
  }

  if (reason.length > 2000) {
    return res
      .status(400)
      .json({ error: 'reason is too long (max 2000 chars)' });
  }

  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, status, dispute_reason, dispute_opened_at')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (match.status === 'disputed') {
    return res.status(409).json({
      error:
        "Ce match est deja en dispute. Resolvez-la avant d'en ouvrir une nouvelle.",
      code: 'ALREADY_DISPUTED',
    });
  }

  if (match.status === 'cancelled') {
    return res.status(400).json({
      error: "Impossible d'ouvrir une dispute sur un match annule.",
    });
  }

  const previousStatus: MatchStatus = match.status;
  const nowIso = new Date().toISOString();

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update({
      status: 'disputed',
      dispute_reason: reason.trim(),
      dispute_opened_by: ctx?.staff?.id ?? null,
      dispute_opened_at: nowIso,
      // Reset toute resolution prealable au cas ou (nouvelle dispute apres resolution).
      dispute_resolution: null,
      dispute_resolved_by: null,
      dispute_resolved_at: null,
      updated_at: nowIso,
    })
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updErr || !updated) {
    logger.error('openDispute update error:', updErr);
    return res.status(500).json({ error: 'Failed to open dispute' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'open_match_dispute',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id ?? null,
      payload: {
        previous_status: previousStatus,
        reason: reason.trim(),
      },
    });
  }

  return res.status(200).json({ match: updated });
}

/* -----------------------------------------------------------
 * PATCH : resoudre une dispute
 * Body : {
 *   resolution: string,
 *   resumeStatus?: MatchStatus,           // status apres resolution (defaut: 'finished' si scores presents, sinon 'pending')
 *   team1Score?: number,                  // override score (optionnel)
 *   team2Score?: number,
 *   winnerTeamId?: string | null,         // override vainqueur (optionnel)
 *   forfeitTeamId?: string | null,        // forfait (optionnel)
 * }
 *
 * Si scores/winner/forfait fournis et resumeStatus = finished/walkover :
 *   passe par applyMatchScore() pour declencher la propagation bracket.
 * Sinon : on remet juste le status + on enregistre la resolution.
 * ---------------------------------------------------------*/

async function resolveDispute(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body || {}) as {
    resolution?: unknown;
    resumeStatus?: unknown;
    team1Score?: unknown;
    team2Score?: unknown;
    winnerTeamId?: unknown;
    forfeitTeamId?: unknown;
  };

  if (
    typeof body.resolution !== 'string' ||
    body.resolution.trim().length === 0
  ) {
    return res.status(400).json({ error: 'resolution is required' });
  }

  if (body.resolution.length > 2000) {
    return res
      .status(400)
      .json({ error: 'resolution is too long (max 2000 chars)' });
  }

  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, status, team1_id, team2_id, team1_score, team2_score'
    )
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (match.status !== 'disputed') {
    return res.status(409).json({
      error: "Ce match n'est pas en dispute.",
      code: 'NOT_DISPUTED',
    });
  }

  // Validation du status de reprise
  let resumeStatus: MatchStatus = 'finished';
  if (typeof body.resumeStatus === 'string') {
    if (!VALID_RESUME_STATUSES.includes(body.resumeStatus as MatchStatus)) {
      return res.status(400).json({
        error: `Invalid resumeStatus. Allowed: ${VALID_RESUME_STATUSES.join(', ')}`,
      });
    }
    resumeStatus = body.resumeStatus as MatchStatus;
  }

  const hasScoreOverride =
    typeof body.team1Score === 'number' && typeof body.team2Score === 'number';
  const hasForfeit =
    typeof body.forfeitTeamId === 'string' && body.forfeitTeamId.length > 0;

  const nowIso = new Date().toISOString();
  const resolverId = ctx?.staff?.id ?? null;
  const trimmedResolution = (body.resolution as string).trim();

  // Cas 1 : la resolution implique un nouveau score / forfait / finished -> applyMatchScore
  if (
    (resumeStatus === 'finished' || resumeStatus === 'walkover') &&
    (hasScoreOverride || hasForfeit)
  ) {
    // 1a) On retire le status 'disputed' avant d'appeler applyMatchScore (qui lui
    //     refuse de toucher un match disputed) — on remet 'pending' temporairement.
    const { error: clearErr } = await supabaseAdmin
      .from('matches')
      .update({
        status: 'pending',
        // On enregistre deja la resolution en parallele (atomicite best-effort).
        dispute_resolution: trimmedResolution,
        dispute_resolved_by: resolverId,
        dispute_resolved_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', matchId);

    if (clearErr) {
      logger.error('resolveDispute clear status error:', clearErr);
      return res.status(500).json({ error: 'Failed to clear dispute status' });
    }

    try {
      const result = await applyMatchScore({
        matchId,
        team1Score: hasScoreOverride ? (body.team1Score as number) : undefined,
        team2Score: hasScoreOverride ? (body.team2Score as number) : undefined,
        winnerTeamId:
          typeof body.winnerTeamId === 'string' ? body.winnerTeamId : undefined,
        forfeitTeamId: hasForfeit ? (body.forfeitTeamId as string) : undefined,
        status: resumeStatus,
        markFinished: resumeStatus === 'finished',
        staffId: resolverId,
        propagateBracket: true,
      });

      if (resolverId) {
        await logStaffAction({
          staff_id: resolverId,
          action: 'resolve_match_dispute',
          entity_type: 'match',
          entity_id: matchId,
          tournament_id: match.tournament_id ?? null,
          payload: {
            resolution: trimmedResolution,
            resume_status: resumeStatus,
            applied_score: hasScoreOverride
              ? { team1: body.team1Score, team2: body.team2Score }
              : null,
            forfeit_team_id: hasForfeit ? body.forfeitTeamId : null,
          },
        });
      }

      return res.status(200).json({ match: result.match });
    } catch (e: unknown) {
      // Rollback: rebascule en disputed pour ne pas perdre la dispute en cours
      await supabaseAdmin
        .from('matches')
        .update({
          status: 'disputed',
          dispute_resolution: null,
          dispute_resolved_by: null,
          dispute_resolved_at: null,
        })
        .eq('id', matchId);

      logger.error('resolveDispute applyMatchScore error:', e);
      return res.status(500).json({
        error: `Erreur lors de l'application du score : ${
          e instanceof Error ? e.message : 'unknown'
        }. La dispute reste ouverte.`,
      });
    }
  }

  // Cas 2 : pas de changement de score, on remet juste le match dans son flow normal
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update({
      status: resumeStatus,
      dispute_resolution: trimmedResolution,
      dispute_resolved_by: resolverId,
      dispute_resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updErr || !updated) {
    logger.error('resolveDispute simple update error:', updErr);
    return res.status(500).json({ error: 'Failed to resolve dispute' });
  }

  if (resolverId) {
    await logStaffAction({
      staff_id: resolverId,
      action: 'resolve_match_dispute',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id ?? null,
      payload: {
        resolution: trimmedResolution,
        resume_status: resumeStatus,
        applied_score: null,
      },
    });
  }

  return res.status(200).json({ match: updated });
}

/* -----------------------------------------------------------
 * DELETE : annuler la dispute (sans resolution)
 * Query : ?resumeStatus=pending|ongoing|finished|walkover (defaut: pending)
 *
 * Utile si la dispute a ete ouverte par erreur. Trace conservee dans staff_logs.
 * ---------------------------------------------------------*/

async function cancelDispute(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  let resumeStatus: MatchStatus = 'pending';
  if (typeof req.query.resumeStatus === 'string') {
    if (
      !VALID_RESUME_STATUSES.includes(req.query.resumeStatus as MatchStatus)
    ) {
      return res.status(400).json({
        error: `Invalid resumeStatus. Allowed: ${VALID_RESUME_STATUSES.join(', ')}`,
      });
    }
    resumeStatus = req.query.resumeStatus as MatchStatus;
  }

  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, status, dispute_reason')
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  if (match.status !== 'disputed') {
    return res.status(409).json({
      error: "Ce match n'est pas en dispute.",
      code: 'NOT_DISPUTED',
    });
  }

  const nowIso = new Date().toISOString();

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('matches')
    .update({
      status: resumeStatus,
      dispute_reason: null,
      dispute_opened_by: null,
      dispute_opened_at: null,
      dispute_resolution: null,
      dispute_resolved_by: null,
      dispute_resolved_at: null,
      updated_at: nowIso,
    })
    .eq('id', matchId)
    .select('*')
    .maybeSingle();

  if (updErr || !updated) {
    logger.error('cancelDispute update error:', updErr);
    return res.status(500).json({ error: 'Failed to cancel dispute' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'cancel_match_dispute',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id ?? null,
      payload: {
        prior_reason: match.dispute_reason,
        resume_status: resumeStatus,
      },
    });
  }

  return res.status(200).json({ match: updated });
}
