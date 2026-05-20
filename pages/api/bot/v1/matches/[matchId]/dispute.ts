// GET /api/bot/v1/matches/[matchId]/dispute
//
// Vue capitaine d'une dispute en cours sur un de ses matches (commande
// Discord /ma-dispute). Expose une version *filtree* de la dispute :
//
//   - matchId, status, openedAt
//   - reports : les deux reports de score (team1 + team2) avec qui les a
//               poses, quand, et le score reporte
//   - staffNote : texte de la decision finale (matches.dispute_resolution)
//                 ou null si pas encore resolu
//   - resolution : { resolvedAt, decidedScoreA, decidedScoreB } ou null
//
// Schema de capitaine retenu : `teams.captain_id` (auth.users.id direct).
// On resout le actorDiscordUserId -> auth_user_id via user_discord_links
// et on verifie que cet auth_user_id == team1.captain_id OU team2.captain_id.
// Cette convention vient des autres routes /api/bot/v1/teams/* (cf.
// teams/[teamId].ts:90, teams/leave.ts:52). Pas de team_members.role
// 'captain', pas de captain_discord_id en colonne dedee.
//
// Aucun champ interne staff (audit log, IP, raison interne) n'est expose :
//   - matches.dispute_opened_by      -> NON exposé (staff UUID interne)
//   - matches.dispute_resolved_by    -> NON exposé (staff UUID interne)
//   - matches.dispute_reason         -> NON exposé (texte interne admin)
//   - match_score_reports.id         -> NON exposé (PK interne)
//   - rejected reports               -> n/a (la table n'en stocke pas)
// On expose uniquement les colonnes voulues, jamais via `select *`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawMatchId = req.query.matchId;
  const matchId = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  const actorDiscordUserId = queryString(req.query.actorDiscordUserId);
  if (!actorDiscordUserId || !DISCORD_ID_RE.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }

  // Resolve actor Discord -> auth_user_id
  const { data: link, error: lErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', actorDiscordUserId)
    .maybeSingle();
  if (lErr) {
    logger.error('[bot/match/dispute] link error', lErr);
    return res.status(500).json({ error: 'Erreur de verification' });
  }
  const actorAuthId =
    link && typeof (link as { auth_user_id: unknown }).auth_user_id === 'string'
      ? (link as { auth_user_id: string }).auth_user_id
      : null;
  if (!actorAuthId) {
    return res.status(403).json({
      error: "Ton compte Discord n'est pas lié au site.",
    });
  }

  // Load match + teams (only the fields we plan to expose).
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, status, dispute_opened_at, dispute_resolution, dispute_resolved_at,
       team1_score, team2_score, team1_id, team2_id,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id)`
    )
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/match/dispute] match error', mErr);
    return res.status(500).json({ error: 'Erreur de lecture du match' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }

  const t1Rel = (match as Record<string, unknown>).team1;
  const t2Rel = (match as Record<string, unknown>).team2;
  const t1 = (Array.isArray(t1Rel) ? t1Rel[0] : t1Rel) as
    | { id: string; name: string | null; captain_id: string | null }
    | null
    | undefined;
  const t2 = (Array.isArray(t2Rel) ? t2Rel[0] : t2Rel) as
    | { id: string; name: string | null; captain_id: string | null }
    | null
    | undefined;

  const isCaptain =
    (t1?.captain_id && t1.captain_id === actorAuthId) ||
    (t2?.captain_id && t2.captain_id === actorAuthId);
  if (!isCaptain) {
    return res.status(403).json({
      error: "Tu n'es pas capitaine d'une des deux équipes de ce match.",
    });
  }

  const openedAt =
    (match as { dispute_opened_at: string | null }).dispute_opened_at;
  const status = (match as { status: string }).status;

  // Pas de dispute (ni en cours, ni resolue) -> 404.
  // On considere "il y a une dispute" si soit le match est en status
  // 'disputed' actuellement, soit dispute_opened_at est non null (resolue).
  const hasDispute = status === 'disputed' || !!openedAt;
  if (!hasDispute) {
    return res
      .status(404)
      .json({ error: 'Pas de dispute sur ce match.' });
  }

  // Reports de score (max 2, un par side). On expose le score + le qui +
  // le quand. On NE retourne PAS l'id interne ni l'auth_user_id du
  // reporter (filtre explicitement).
  const { data: reportRows } = await supabaseAdmin
    .from('match_score_reports')
    .select(
      'team_side, team1_score, team2_score, discord_user_id, reported_at, updated_at'
    )
    .eq('match_id', matchId);

  const reports = (reportRows ?? []).map((row) => {
    const r = row as {
      team_side: number;
      team1_score: number;
      team2_score: number;
      discord_user_id: string | null;
      reported_at: string | null;
      updated_at: string | null;
    };
    const teamRef = r.team_side === 1 ? t1 : t2;
    return {
      teamId: teamRef?.id ?? null,
      teamName: teamRef?.name ?? null,
      submittedBy: r.discord_user_id ?? null,
      scoreA: r.team1_score,
      scoreB: r.team2_score,
      submittedAt: r.updated_at ?? r.reported_at ?? null,
    };
  });

  const resolvedAt = (match as { dispute_resolved_at: string | null })
    .dispute_resolved_at;
  const resolution = resolvedAt
    ? {
        resolvedAt,
        decidedScoreA: (match as { team1_score: number | null }).team1_score,
        decidedScoreB: (match as { team2_score: number | null }).team2_score,
      }
    : null;

  return res.status(200).json({
    matchId,
    status,
    openedAt,
    reports,
    staffNote:
      (match as { dispute_resolution: string | null }).dispute_resolution ??
      null,
    resolution,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-match-dispute' },
});
