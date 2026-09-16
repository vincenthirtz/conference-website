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
//
// Gardes d'integrite (lot 1, 2026-09-16) — contrat partage avec l'ecran :
//   * 409 MATCH_NOT_STARTED        : coup d'envoi (scheduled_at) pas encore passe
//                                    et match pas 'ongoing'. Sans elle, deux
//                                    reports concordants finalisaient un match
//                                    non joue et propageaient le bracket.
//   * 400 INVALID_SCORE_FOR_FORMAT : couple de scores impossible pour le BO du
//                                    match (3-3 en BO3 finalisait un nul).
//   * 409 FINALIZATION_IN_PROGRESS : l'autre capitaine finalise au meme instant
//                                    (cf. claimFinalization d'applyMatchScore).
// Les reports d'un match rouvert par le staff sans score sont purges par les
// routes de dispute (utils/matches/scoreReports.ts) : un report adverse
// anterieur a la decision du staff ne peut plus servir de vote.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  applyMatchScore,
  MatchFinalizationConflictError,
} from '@/utils/matches/applyScore';
import {
  invalidScoreForFormatMessage,
  isReportBeforeKickoff,
  isScoreValidForBestOf,
  resolveSeriesBestOf,
  isStaffOpenedDispute,
  DISPUTE_UNDER_STAFF_REVIEW,
  DISPUTE_UNDER_STAFF_REVIEW_MESSAGE,
} from '@/utils/matches/scoreReports';
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
       scheduled_at, best_of, match_format, dispute_opened_by,
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

  // 3b) Le match a-t-il commence ? Evalue APRES le controle capitaine : un
  // tiers n'a pas a apprendre l'horaire par ce biais. `ongoing` passe toujours
  // (match lance en avance par le staff).
  if (
    isReportBeforeKickoff({
      status: match.status,
      scheduledAt: (match as { scheduled_at?: string | null }).scheduled_at,
      startedStatus: 'ongoing',
    })
  ) {
    return res.status(409).json({
      error:
        "Le match n'a pas encore commence : le score se rapporte apres le coup d'envoi. S'il a ete joue en avance, demandez au staff de le passer en cours.",
      code: 'MATCH_NOT_STARTED',
    });
  }

  // 3c) Couple de scores coherent avec le best-of. Format absent, inconnu ou
  // contradictoire -> bestOf null -> aucune borne (cf. resolveSeriesBestOf).
  const bestOf = resolveSeriesBestOf(
    (match as { best_of?: unknown }).best_of,
    (match as { match_format?: unknown }).match_format
  );
  if (
    bestOf !== null &&
    !isScoreValidForBestOf(team1Score, team2Score, bestOf)
  ) {
    return res.status(400).json({
      error: invalidScoreForFormatMessage(bestOf),
      code: 'INVALID_SCORE_FOR_FORMAT',
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
    // Une dispute ouverte par le STAFF ne se referme pas par l'accord des
    // capitaines : elle instruit souvent autre chose que le score (joueuse
    // inéligible, triche), sur quoi les deux équipes peuvent s'entendre en étant
    // toutes deux en cause. Le report reste enregistré pour le staff ; seul le
    // staff tranche. Cf. isStaffOpenedDispute.
    if (isStaffOpenedDispute(match)) {
      return res.status(409).json({
        error: DISPUTE_UNDER_STAFF_REVIEW_MESSAGE,
        code: DISPUTE_UNDER_STAFF_REVIEW,
      });
    }

    // Si le match est 'disputed', on retire le status avant applyMatchScore
    // (qui refuse les matchs en dispute).
    //
    // CONDITIONNEL au statut 'disputed' : si les deux capitaines valident en
    // meme temps, la premiere a pu deja fermer la dispute ET finaliser. Sans
    // la condition, la seconde remettait un match 'finished' en 'pending' et
    // applyMatchScore le re-finalisait (bracket re-propage, events en double).
    // Zero ligne touchee n'est pas une erreur : applyMatchScore relit le match
    // et sort en no-op si le meme score est deja applique.
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
        .eq('id', matchId)
        .eq('status', 'disputed')
        // Même garde côté base : jamais une dispute staff, même si elle a été
        // ouverte entre notre lecture et cette écriture.
        .is('dispute_opened_by', null);
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
        // Deux capitaines peuvent arriver ici a la meme seconde : la
        // reservation garantit une seule finalisation (cf. applyScore.ts 4c).
        claimFinalization: true,
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
      if (e instanceof MatchFinalizationConflictError) {
        return respondToFinalizationConflict(res, {
          tenantId,
          matchId,
          scrimId: match.scrim_id ?? null,
          team1Score: mine.team1_score,
          team2Score: mine.team2_score,
        });
      }
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

    // CONDITIONNEL au statut lu : l'adversaire (ou le staff) a pu clore le
    // match entre notre lecture et ce report divergent. Sans la condition, un
    // report tardif remettait en dispute un match deja 'finished'.
    const { data: disputedRow, error: disputeErr } = await supabaseAdmin
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
      .eq('id', matchId)
      .eq('status', match.status)
      .select('id')
      .maybeSingle();

    if (disputeErr) {
      logger.error('[player/report-score] open dispute error', disputeErr);
      return res
        .status(500)
        .json({ error: "Echec de l'ouverture de la dispute" });
    }
    if (!disputedRow) {
      return res.status(409).json({
        error:
          'Le match a change pendant votre report (cloture ou modifie). Rechargez la page ; contactez le staff pour contester.',
        code: 'MATCH_FINALIZED',
      });
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

/**
 * La reservation de finalisation a ete perdue (cf. applyScore.ts 4c). On relit
 * le match pour dire la verite a la capitaine plutot qu'un 500 :
 *   * deja clos sur CE score         -> 200 'finalized' (l'autre capitaine a
 *                                       finalise le meme resultat a l'instant) ;
 *   * clos sur un autre score/statut -> 409 MATCH_FINALIZED (le staff a tranche) ;
 *   * pas encore clos                -> 409 FINALIZATION_IN_PROGRESS (l'autre
 *                                       finalisation est en cours ; ce report
 *                                       est enregistre, rien a refaire).
 */
async function respondToFinalizationConflict(
  res: NextApiResponse,
  // `unknown` (et non number/string) : ce sont les colonnes non typées du
  // client Supabase, relayées telles quelles. Garder le MÊME type que la
  // réponse 'finalized' du handler fait que docs/openapi/inferred-responses
  // n'y voit qu'une seule forme de réponse, et non deux quasi identiques.
  ctx: {
    tenantId: string;
    matchId: string;
    scrimId: unknown;
    team1Score: unknown;
    team2Score: unknown;
  }
) {
  const { data: current } = await supabaseAdmin
    .from('matches')
    .select('status, team1_score, team2_score, winner_team_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', ctx.matchId)
    .maybeSingle();

  const row = current as {
    status: string;
    team1_score: number | null;
    team2_score: number | null;
    winner_team_id: string | null;
  } | null;

  if (
    row?.status === 'finished' &&
    row.team1_score === ctx.team1Score &&
    row.team2_score === ctx.team2Score
  ) {
    return res.status(200).json({
      status: 'finalized',
      matchId: ctx.matchId,
      scrimId: ctx.scrimId,
      team1Score: ctx.team1Score,
      team2Score: ctx.team2Score,
      winnerTeamId: row.winner_team_id ?? null,
    });
  }
  if (row && TERMINAL_STATUSES.has(row.status)) {
    return res.status(409).json({
      error: `Match deja cloture (status=${row.status}). Contactez le staff pour modifier.`,
      code: 'MATCH_FINALIZED',
    });
  }
  logger.warn('[player/report-score] finalization claim lost', {
    matchId: ctx.matchId,
    status: row?.status ?? null,
  });
  return res.status(409).json({
    error:
      "Le score est en cours de validation par l'autre equipe. Rechargez dans quelques secondes.",
    code: 'FINALIZATION_IN_PROGRESS',
  });
}
