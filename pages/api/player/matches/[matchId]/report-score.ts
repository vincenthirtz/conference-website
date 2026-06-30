// pages/api/player/matches/[matchId]/report-score.ts
//
// POST — pendant WEB de /api/bot/v1/matches/[matchId]/report : permet a un
// CAPITAINE, depuis l'espace capitaine du site, de rapporter le score final
// d'un de ses matchs. Reutilise integralement la logique du handler bot :
//
//   * un seul report present  -> on attend l'adversaire (rien ne change)
//   * les deux concordent     -> applyMatchScore() finalise (status='finished',
//                                propagation bracket, notifications Discord)
//   * les deux divergent      -> matches.status -> 'disputed' (+ raison auto,
//                                event bot match.disputed, embed staff tournoi)
//
// Re-soumission supportee (upsert idempotent sur (match_id, team_side)) : un
// capitaine peut corriger son report ; si son report rejoint celui de
// l'adversaire alors que le match etait 'disputed', la dispute est fermee et
// applyMatchScore est appele.
//
// Auth : Bearer (withAuthRoute). Le droit de rapport = etre teams.captain_id
// de team1 OU team2 du match (pas de consultation team_members). 403 sinon.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { notifyScoreReportDispute } from '@/utils/discord';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';

import { logger } from '../../../../../utils/logger';

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

const TERMINAL_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

const bodySchema = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
});

const querySchema = z.object({ matchId: z.string().uuid() });

function reportsAgree(
  a: { team1_score: number; team2_score: number },
  b: { team1_score: number; team2_score: number }
): boolean {
  return a.team1_score === b.team1_score && a.team2_score === b.team2_score;
}

/** PostgREST embeds come back object|array depending on FK cardinality. */
function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Action ecriture par capitaine : on borne par IP (le user est deja
  // authentifie ; pas d'acteur Discord ici).
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'player-report-score'
    )
  ) {
    return;
  }

  // 1) Validation entree (path + body).
  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: 'Identifiant de match invalide.' });
  }
  const { matchId } = parsedQuery.data;

  const parsedBody = bodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      error:
        'Scores invalides : team1Score et team2Score doivent etre des entiers >= 0.',
    });
  }
  const { team1Score, team2Score } = parsedBody.data;

  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: user.id });

  // 2) Match + capitaines, scope tenant.
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, scrim_id, status, is_bye,
       team1_id, team2_id,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id),
       tournament:tournament_id (id, name)`
    )
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[player/report-score] match lookup error', matchErr);
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

  const team1 = unwrap((match as { team1?: unknown }).team1) as {
    id: string;
    name: string;
    captain_id: string | null;
  } | null;
  const team2 = unwrap((match as { team2?: unknown }).team2) as {
    id: string;
    name: string;
    captain_id: string | null;
  } | null;
  const tournament = unwrap((match as { tournament?: unknown }).tournament) as {
    id: string;
    name: string;
  } | null;

  if (!team1?.id || !team2?.id) {
    return res
      .status(400)
      .json({ error: 'Match incomplet (equipes non assignees)' });
  }

  // 3) Le droit de rapport = etre captain_id de team1 OU team2.
  const isTeam1Captain = team1.captain_id === user.id;
  const isTeam2Captain = team2.captain_id === user.id;
  if (!isTeam1Captain && !isTeam2Captain) {
    return res.status(403).json({
      error: "Vous n'etes pas le capitaine d'une des deux equipes de ce match.",
    });
  }

  const mySide: 1 | 2 = isTeam1Captain ? 1 : 2;
  const opponentSide: 1 | 2 = mySide === 1 ? 2 : 1;

  // 4) Upsert du report de mon equipe (idempotent sur (match_id, team_side)).
  const { error: upsertErr } = await supabaseAdmin
    .from('match_score_reports')
    .upsert(
      {
        tenant_id: tenantId,
        match_id: matchId,
        team_side: mySide,
        reported_by_auth_user_id: user.id,
        discord_user_id: null,
        team1_score: team1Score,
        team2_score: team2Score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_id,team_side' }
    );

  if (upsertErr) {
    logger.error('[player/report-score] upsert report error', upsertErr);
    return res
      .status(500)
      .json({ error: "Echec de l'enregistrement du report" });
  }

  logger.info('[player/report-score] captain score report received', {
    matchId,
    mySide,
    team1Score,
    team2Score,
    captainAuthId: user.id,
  });

  // 5) Relire les deux reports apres l'upsert.
  const { data: bothReports, error: reportsErr } = await supabaseAdmin
    .from('match_score_reports')
    .select('team_side, team1_score, team2_score, reported_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);

  if (reportsErr) {
    logger.error('[player/report-score] reports lookup error', reportsErr);
    return res.status(500).json({ error: 'Erreur de lecture des reports' });
  }

  const mine = bothReports?.find((r) => r.team_side === mySide) ?? null;
  const opponent =
    bothReports?.find((r) => r.team_side === opponentSide) ?? null;

  // Case A: en attente de l'adversaire.
  if (!opponent) {
    return res.status(200).json({
      status: 'awaiting_opponent',
      matchId,
      mySide,
      opponentSide,
      myReport: mine,
    });
  }

  // Case B: les deux reports concordent -> finalisation.
  if (mine && reportsAgree(mine, opponent)) {
    // Si le match est 'disputed', on retire le status avant applyMatchScore
    // (qui refuse les matchs en dispute).
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
        .eq('tenant_id', tenantId)
        .eq('id', matchId);
      if (clearErr) {
        logger.error('[player/report-score] clear dispute error', clearErr);
        return res
          .status(500)
          .json({ error: 'Echec de la fermeture de la dispute' });
      }
    }

    try {
      const isScrim = !!match.scrim_id;
      const result = await applyMatchScore({
        tenantId,
        matchId,
        team1Score: mine.team1_score,
        team2Score: mine.team2_score,
        markFinished: true,
        staffId: null,
        propagateBracket: !isScrim,
      });
      return res.status(200).json({
        status: 'finalized',
        matchId,
        scrimId: match.scrim_id ?? null,
        team1Score: mine.team1_score,
        team2Score: mine.team2_score,
        winnerTeamId: result.winnerTeamId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[player/report-score] applyMatchScore error', e);
      return res.status(500).json({
        error: `Echec de la finalisation : ${msg}`,
        code: 'APPLY_FAILED',
      });
    }
  }

  // Case C: les deux reports existent et divergent -> dispute.
  const wasAlreadyDisputed = match.status === 'disputed';
  if (!wasAlreadyDisputed) {
    const nowIso = new Date().toISOString();
    const reasonParts = [
      `Desaccord capitaines (via site) :`,
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
      .eq('tenant_id', tenantId)
      .eq('id', matchId);

    if (disputeErr) {
      logger.error('[player/report-score] open dispute error', disputeErr);
      return res
        .status(500)
        .json({ error: "Echec de l'ouverture de la dispute" });
    }

    void (async () => {
      const enriched = await enrichMatchEvent(matchId);
      await emitBotEvent(
        'match.disputed',
        {
          matchId,
          tournamentId: match.tournament_id ?? null,
          scrimId: match.scrim_id ?? null,
          previousStatus: match.status,
          reason: reasonParts,
          openedBy: 'captain',
          openedByStaffId: null,
          enriched,
        },
        tenantId
      );
    })().catch((e) => logger.error('[botEvents] match.disputed emit error', e));
  }

  // Notification Discord staff — uniquement pour les matchs de tournoi.
  const t1Report = bothReports?.find((r) => r.team_side === 1);
  const t2Report = bothReports?.find((r) => r.team_side === 2);
  if (t1Report && t2Report && !match.scrim_id) {
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
      logger.error('[player/report-score] dispute notify error', e)
    );
  }

  return res.status(200).json({
    status: 'disputed',
    matchId,
    scrimId: match.scrim_id ?? null,
    mySide,
    myReport: mine,
    opponentReport: opponent,
  });
});
