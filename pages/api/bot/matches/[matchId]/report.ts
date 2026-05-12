// POST /api/bot/matches/[matchId]/report
//
// Permet a un capitaine (depuis Discord) de soumettre le score final d'un
// match. Le serveur stocke un report par equipe (table match_score_reports,
// unique sur (match_id, team_side)) puis compare avec le report de l'autre
// equipe :
//
//   * un seul report present       -> on attend l'adversaire (rien ne change
//                                     sur matches)
//   * les deux concordent          -> applyMatchScore() finalise le match
//                                     (status='finished', propagation bracket,
//                                     notifications Discord match_results)
//   * les deux divergent           -> matches.status -> 'disputed', remplit
//                                     dispute_reason auto, poste un embed sur
//                                     le canal support_tickets
//
// Re-soumission supportee : si un match est deja en 'disputed' et que le
// capitaine corrige son report pour qu'il corresponde a celui de l'adversaire,
// la dispute est fermee et applyMatchScore est appele.
//
// Auth : x-api-key (BOT_API_KEY). Identite du capitaine verifiee via
// user_discord_links.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { notifyScoreReportDispute } from '@/utils/discord';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '../../../../../utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

const TERMINAL_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function reportsAgree(
  a: { team1_score: number; team2_score: number },
  b: { team1_score: number; team2_score: number }
): boolean {
  return a.team1_score === b.team1_score && a.team2_score === b.team2_score;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'bot-match-report')
  )
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/matches/report] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const rawMatchId = req.query.matchId;
  const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const discordUserId =
    typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  if (!DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const team1Score = body.team1Score;
  const team2Score = body.team2Score;
  if (
    typeof team1Score !== 'number' ||
    typeof team2Score !== 'number' ||
    !Number.isInteger(team1Score) ||
    !Number.isInteger(team2Score) ||
    team1Score < 0 ||
    team2Score < 0 ||
    team1Score > 99 ||
    team2Score > 99
  ) {
    return res.status(400).json({
      error: 'team1Score et team2Score doivent etre des entiers entre 0 et 99',
    });
  }

  // 1) Match + captains
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, status, is_bye,
       team1_id, team2_id,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id),
       tournament:tournament_id (id, name)`
    )
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[bot/matches/report] match lookup error', matchErr);
    return res.status(500).json({ error: 'Erreur de lecture du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.is_bye) {
    return res.status(400).json({ error: 'Match marque bye' });
  }
  if (TERMINAL_STATUSES.has(match.status)) {
    return res.status(409).json({
      error: `Match deja cloture (status=${match.status}). Contactez le staff pour modifier.`,
      code: 'MATCH_FINALIZED',
    });
  }

  const team1 = Array.isArray((match as any).team1)
    ? (match as any).team1[0]
    : (match as any).team1;
  const team2 = Array.isArray((match as any).team2)
    ? (match as any).team2[0]
    : (match as any).team2;
  const tournament = Array.isArray((match as any).tournament)
    ? (match as any).tournament[0]
    : (match as any).tournament;

  if (!team1?.id || !team2?.id) {
    return res
      .status(400)
      .json({ error: 'Match incomplet (equipes non assignees)' });
  }

  const captainIds: string[] = [team1?.captain_id, team2?.captain_id].filter(
    (v): v is string => typeof v === 'string'
  );
  if (captainIds.length < 2) {
    return res.status(400).json({
      error: 'Capitaines manquants sur le match — report impossible.',
    });
  }

  // 2) Identify the reporting captain via discord link
  const { data: links, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id')
    .in('auth_user_id', captainIds)
    .eq('discord_user_id', discordUserId)
    .limit(1);

  if (linkErr) {
    logger.error('[bot/matches/report] link lookup error', linkErr);
    return res
      .status(500)
      .json({ error: 'Erreur de verification capitaine' });
  }

  const reportingAuthId = links?.[0]?.auth_user_id ?? null;
  if (!reportingAuthId) {
    return res.status(403).json({
      error:
        "Ce compte Discord n'est pas le capitaine d'une des deux equipes de ce match.",
    });
  }

  const mySide: 1 | 2 = reportingAuthId === team1.captain_id ? 1 : 2;
  const opponentSide: 1 | 2 = mySide === 1 ? 2 : 1;

  // 3) Upsert this side's report
  const { error: upsertErr } = await supabaseAdmin
    .from('match_score_reports')
    .upsert(
      {
        match_id: matchId,
        team_side: mySide,
        reported_by_auth_user_id: reportingAuthId,
        discord_user_id: discordUserId,
        team1_score: team1Score,
        team2_score: team2Score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id,team_side' }
    );

  if (upsertErr) {
    logger.error('[bot/matches/report] upsert report error', upsertErr);
    return res
      .status(500)
      .json({ error: "Echec de l'enregistrement du report" });
  }

  // 4) Look up both reports after the upsert
  const { data: bothReports, error: reportsErr } = await supabaseAdmin
    .from('match_score_reports')
    .select('team_side, team1_score, team2_score, reported_at, updated_at')
    .eq('match_id', matchId);

  if (reportsErr) {
    logger.error('[bot/matches/report] reports lookup error', reportsErr);
    return res.status(500).json({ error: 'Erreur de lecture des reports' });
  }

  const mine = bothReports?.find((r) => r.team_side === mySide) ?? null;
  const opponent =
    bothReports?.find((r) => r.team_side === opponentSide) ?? null;

  // Case A: waiting for opponent
  if (!opponent) {
    return res.status(200).json({
      status: 'awaiting_opponent',
      matchId,
      mySide,
      opponentSide,
      myReport: mine,
    });
  }

  // Case B: both reports agree → finalize (close dispute first if needed)
  if (mine && reportsAgree(mine, opponent)) {
    // If the match is currently 'disputed', we must clear the status before
    // applyMatchScore (which refuses disputed matches).
    if (match.status === 'disputed') {
      const nowIso = new Date().toISOString();
      const { error: clearErr } = await supabaseAdmin
        .from('matches')
        .update({
          status: 'pending',
          dispute_resolution:
            'Resolu automatiquement : les deux capitaines ont accorde leur report.',
          dispute_resolved_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', matchId);
      if (clearErr) {
        logger.error('[bot/matches/report] clear dispute error', clearErr);
        return res
          .status(500)
          .json({ error: 'Echec de la fermeture de la dispute' });
      }
    }

    try {
      const result = await applyMatchScore({
        matchId,
        team1Score: mine.team1_score,
        team2Score: mine.team2_score,
        markFinished: true,
        staffId: null,
        propagateBracket: true,
      });
      return res.status(200).json({
        status: 'finalized',
        matchId,
        team1Score: mine.team1_score,
        team2Score: mine.team2_score,
        winnerTeamId: result.winnerTeamId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[bot/matches/report] applyMatchScore error', e);
      return res.status(500).json({
        error: `Echec de la finalisation : ${msg}`,
        code: 'APPLY_FAILED',
      });
    }
  }

  // Case C: both reports exist and disagree → open (or keep) dispute
  const wasAlreadyDisputed = match.status === 'disputed';
  if (!wasAlreadyDisputed) {
    const nowIso = new Date().toISOString();
    const reasonParts = [
      `Desaccord capitaines (via bot Discord) :`,
      `- ${team1.name} : ${
        bothReports?.find((r) => r.team_side === 1)?.team1_score
      }-${bothReports?.find((r) => r.team_side === 1)?.team2_score}`,
      `- ${team2.name} : ${
        bothReports?.find((r) => r.team_side === 2)?.team1_score
      }-${bothReports?.find((r) => r.team_side === 2)?.team2_score}`,
    ].join('\n');

    const { error: disputeErr } = await supabaseAdmin
      .from('matches')
      .update({
        status: 'disputed',
        dispute_reason: reasonParts,
        dispute_opened_by: null,
        dispute_opened_at: nowIso,
        dispute_resolution: null,
        dispute_resolved_by: null,
        dispute_resolved_at: null,
        updated_at: nowIso,
      })
      .eq('id', matchId);

    if (disputeErr) {
      logger.error('[bot/matches/report] open dispute error', disputeErr);
      return res
        .status(500)
        .json({ error: "Echec de l'ouverture de la dispute" });
    }

    void emitBotEvent('match.disputed', {
      matchId,
      tournamentId: match.tournament_id ?? null,
      previousStatus: match.status,
      reason: reasonParts,
      openedBy: 'bot',
      openedByStaffId: null,
    }).catch((e) => logger.error('[botEvents] match.disputed emit error', e));
  }

  // Fire-and-forget Discord notification
  const t1Report = bothReports?.find((r) => r.team_side === 1);
  const t2Report = bothReports?.find((r) => r.team_side === 2);
  if (t1Report && t2Report) {
    void notifyScoreReportDispute({
      matchId,
      tournamentId: match.tournament_id ?? null,
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
      logger.error('[bot/matches/report] dispute notify error', e)
    );
  }

  return res.status(200).json({
    status: 'disputed',
    matchId,
    mySide,
    myReport: mine,
    opponentReport: opponent,
  });
}
