// POST /api/bot/v1/matches/[matchId]/resolve-dispute
//
// Commande /resoudre-dispute (admin) : ferme une dispute en appliquant les
// scores definitifs decides par le staff. Mirror du PATCH admin
// /api/admin/matches/[matchId]/dispute, adapte au transport bot.
//
// Body :
//   actorDiscordUserId : staff admin/owner
//   resolution         : texte (raison de la decision)
//   team1Score?        : entier >= 0 (requis si pas de forfeitTeamId)
//   team2Score?        : entier >= 0
//   winnerTeamId?      : UUID (sinon calcule depuis les scores)
//   forfeitTeamId?     : UUID (alternative aux scores)
//   resumeStatus?      : 'finished' (defaut) | 'walkover' | 'pending' | 'ongoing'
//
// Effets : update status, dispute_resolution/by/at, applique le score via
// applyMatchScore (propage le bracket), log staff_logs.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

const VALID_RESUME = new Set(['pending', 'ongoing', 'finished', 'walkover']);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const resolution =
    typeof body.resolution === 'string' ? body.resolution.trim() : '';
  if (!resolution) {
    return res.status(400).json({ error: 'resolution requise' });
  }
  if (resolution.length > 2000) {
    return res
      .status(400)
      .json({ error: 'resolution trop longue (max 2000 caractères)' });
  }

  const resumeStatusRaw =
    typeof body.resumeStatus === 'string' ? body.resumeStatus.trim() : 'finished';
  if (!VALID_RESUME.has(resumeStatusRaw)) {
    return res.status(400).json({
      error: `resumeStatus invalide. Valeurs : ${[...VALID_RESUME].join(', ')}.`,
    });
  }
  const resumeStatus = resumeStatusRaw as
    | 'pending'
    | 'ongoing'
    | 'finished'
    | 'walkover';

  const t1 = body.team1Score;
  const t2 = body.team2Score;
  const hasScoreOverride =
    typeof t1 === 'number' &&
    typeof t2 === 'number' &&
    Number.isInteger(t1) &&
    Number.isInteger(t2) &&
    t1 >= 0 &&
    t2 >= 0;

  const forfeitTeamId =
    typeof body.forfeitTeamId === 'string' ? body.forfeitTeamId.trim() : '';
  const hasForfeit = !!forfeitTeamId && isValidUUID(forfeitTeamId);

  const winnerTeamId =
    typeof body.winnerTeamId === 'string' ? body.winnerTeamId.trim() : '';
  if (winnerTeamId && !isValidUUID(winnerTeamId)) {
    return res.status(400).json({ error: 'winnerTeamId invalide' });
  }

  if (
    (resumeStatus === 'finished' || resumeStatus === 'walkover') &&
    !hasScoreOverride &&
    !hasForfeit
  ) {
    return res.status(400).json({
      error:
        'Score (team1Score/team2Score) OU forfeitTeamId requis pour cloturer (finished/walkover).',
    });
  }

  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id, status, team1_id, team2_id')
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/resolve-dispute] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.status !== 'disputed') {
    return res
      .status(409)
      .json({ error: "Ce match n'est pas en dispute.", code: 'NOT_DISPUTED' });
  }
  if (hasForfeit && forfeitTeamId !== match.team1_id && forfeitTeamId !== match.team2_id) {
    return res
      .status(400)
      .json({ error: "forfeitTeamId ne correspond pas a une equipe du match." });
  }

  const nowIso = new Date().toISOString();
  const needsApply =
    (resumeStatus === 'finished' || resumeStatus === 'walkover') &&
    (hasScoreOverride || hasForfeit);

  // Cas 1 : on doit appliquer un score -> clear 'disputed' temporairement puis
  // applyMatchScore. Rollback si l'apply rate.
  if (needsApply) {
    const { error: clearErr } = await supabaseAdmin
      .from('matches')
      .update({
        status: 'pending',
        dispute_resolution: resolution,
        dispute_resolved_by: null, // staff id mappe au cote site, pas exposable
        dispute_resolved_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', matchId);
    if (clearErr) {
      logger.error('[bot/resolve-dispute] clear status error', clearErr);
      return res
        .status(500)
        .json({ error: 'Echec de la sortie du statut disputed.' });
    }

    try {
      const result = await applyMatchScore({
        matchId,
        team1Score: hasScoreOverride ? (t1 as number) : undefined,
        team2Score: hasScoreOverride ? (t2 as number) : undefined,
        winnerTeamId: winnerTeamId || undefined,
        forfeitTeamId: hasForfeit ? forfeitTeamId : undefined,
        status: resumeStatus,
        markFinished: resumeStatus === 'finished',
        staffId: actor.staffId,
        propagateBracket: true,
      });

      await logBotStaffAction({
        staffId: actor.staffId,
        action: 'resolve_match_dispute',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id ?? null,
        payload: {
          resolution,
          resume_status: resumeStatus,
          applied_score: hasScoreOverride ? { team1: t1, team2: t2 } : null,
          forfeit_team_id: hasForfeit ? forfeitTeamId : null,
        },
      });

      void (async () => {
        const { data: row } = await supabaseAdmin
          .from('matches')
          .select('discord_dispute_thread_id')
          .eq('id', matchId)
          .maybeSingle();
        await emitBotEvent('match.dispute.resolved', {
          matchId,
          tournamentId: match.tournament_id ?? null,
          resolution,
          resumeStatus,
          resolvedByStaffId: actor.staffId,
          cancelled: false,
          discordDisputeThreadId: row?.discord_dispute_thread_id ?? null,
        });
      })().catch((err) =>
        logger.error('[botEvents] match.dispute.resolved emit error:', err)
      );

      return res.status(200).json({
        success: true,
        matchId,
        winnerTeamId: result.winnerTeamId,
        status: (result.match as { status?: string } | null)?.status ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[bot/resolve-dispute] applyMatchScore error', e);
      // Rollback : remet 'disputed'
      await supabaseAdmin
        .from('matches')
        .update({
          status: 'disputed',
          dispute_resolution: null,
          dispute_resolved_at: null,
        })
        .eq('id', matchId);
      return res.status(500).json({
        error: `Echec de l'application du score : ${msg}. Dispute conservee.`,
        code: 'APPLY_FAILED',
      });
    }
  }

  // Cas 2 : pas de score override (resumeStatus pending/ongoing) — simple
  // update.
  const { error: updErr } = await supabaseAdmin
    .from('matches')
    .update({
      status: resumeStatus,
      dispute_resolution: resolution,
      dispute_resolved_by: null,
      dispute_resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', matchId);
  if (updErr) {
    logger.error('[bot/resolve-dispute] simple update error', updErr);
    return res.status(500).json({ error: 'Echec de la resolution.' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'resolve_match_dispute',
    entity_type: 'match',
    entity_id: matchId,
    tournament_id: match.tournament_id ?? null,
    payload: {
      resolution,
      resume_status: resumeStatus,
      applied_score: null,
    },
  });

  void (async () => {
    const { data: row } = await supabaseAdmin
      .from('matches')
      .select('discord_dispute_thread_id')
      .eq('id', matchId)
      .maybeSingle();
    await emitBotEvent('match.dispute.resolved', {
      matchId,
      tournamentId: match.tournament_id ?? null,
      resolution,
      resumeStatus,
      resolvedByStaffId: actor.staffId,
      cancelled: false,
      discordDisputeThreadId: row?.discord_dispute_thread_id ?? null,
    });
  })().catch((err) =>
    logger.error('[botEvents] match.dispute.resolved emit error:', err)
  );

  return res.status(200).json({
    success: true,
    matchId,
    status: resumeStatus,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 20,
    key: 'bot-match-resolve-dispute',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
});
