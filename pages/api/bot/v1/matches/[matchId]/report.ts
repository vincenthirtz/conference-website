// POST /api/bot/v1/matches/[matchId]/report
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

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  discordIdSchema,
  scoreSchema,
  uuidSchema,
} from '@/utils/botValidation';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { reconcileMatchResult } from '@/utils/matches/reconcile';
import { getSlaMinutes } from '@/utils/disputes/slaBreaches';
import { notifyScoreReportDispute } from '@/utils/discord';
import { emitBotEvent } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const reportBodySchema = z.object({
  discordUserId: discordIdSchema,
  team1Score: scoreSchema,
  team2Score: scoreSchema,
});
const reportQuerySchema = z.object({ matchId: uuidSchema });

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

const TERMINAL_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  // matchId (path) et body validés par withBotRoute (query/bodySchema).
  const { matchId } = req.botQuery as z.infer<typeof reportQuerySchema>;
  const { discordUserId, team1Score, team2Score } = req.botInput as z.infer<
    typeof reportBodySchema
  >;

  // 1) Match + captains.
  //    scrim_id est lu pour distinguer les matches de scrim (pas de bracket
  //    a propager, pas de notification dispute-forum tournoi, payload event
  //    enrichi avec scrimId).
  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, scrim_id, status, is_bye,
       team1_id, team2_id,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id),
       tournament:tournament_id (id, name)`
    )
    .eq('tenant_id', req.botContext.tenantId)
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
    return res.status(500).json({ error: 'Erreur de verification capitaine' });
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
        tenant_id: req.botContext.tenantId,
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

  logger.info('[bot/matches/report] captain score report received', {
    matchId,
    mySide,
    team1Score,
    team2Score,
    discordUserId,
    captainAuthId: reportingAuthId,
  });

  void logPlayerAction({
    actorAuthUserId: reportingAuthId,
    actorDiscordUserId: discordUserId,
    action: 'report_score',
    entityType: 'match',
    entityId: matchId,
    payload: {
      my_side: mySide,
      team1_score: team1Score,
      team2_score: team2Score,
    },
  });

  // 4) Look up both reports after the upsert
  const { data: bothReports, error: reportsErr } = await supabaseAdmin
    .from('match_score_reports')
    .select('team_side, team1_score, team2_score, reported_at, updated_at')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);

  if (reportsErr) {
    logger.error('[bot/matches/report] reports lookup error', reportsErr);
    return res.status(500).json({ error: 'Erreur de lecture des reports' });
  }

  const mine = bothReports?.find((r) => r.team_side === mySide) ?? null;
  const opponent =
    bothReports?.find((r) => r.team_side === opponentSide) ?? null;

  // 5) Reconciliation — logique PURE deportee dans utils/matches/reconcile.ts.
  //    On charge les preuves attachees au match + le SLA du tenant (delai de
  //    silence adverse au-dela duquel un report unilatéral + preuve peut
  //    l'emporter), puis on delegue la decision (attente / accord /
  //    auto-resolution sur silence+preuve / arbitrage). L'API reste
  //    responsable des I/O : finaliser, ouvrir la dispute, ou repondre 200.
  const { data: evidenceRows, error: evErr } = await supabaseAdmin
    .from('match_evidence')
    .select('id, team_side, kind')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId);
  if (evErr) {
    logger.error('[bot/matches/report] evidence lookup error', evErr);
    return res.status(500).json({ error: 'Erreur de lecture des preuves' });
  }

  const slaMinutes = await getSlaMinutes(req.botContext.tenantId);
  const nowIsoRec = new Date().toISOString();

  const outcome = reconcileMatchResult({
    reports: (bothReports ?? []).map((r) => ({
      teamSide: r.team_side as 1 | 2,
      team1Score: r.team1_score,
      team2Score: r.team2_score,
      reportedAt:
        (r.reported_at as string | null) ??
        (r.updated_at as string | null) ??
        nowIsoRec,
    })),
    evidence: (evidenceRows ?? []).map((e) => ({
      teamSide: (e.team_side as 1 | 2 | null) ?? null,
      kind: e.kind as 'screenshot' | 'replay_file' | 'replay_url',
      id: e.id as string,
    })),
    now: nowIsoRec,
    config: { opponentSilenceDeadlineMinutes: slaMinutes },
  });

  // Case A: still waiting (no opponent yet, or lone report inside the SLA
  // window). No-op on `matches`.
  if (
    outcome.outcome === 'awaiting_reports' ||
    outcome.outcome === 'awaiting_opponent'
  ) {
    return res.status(200).json({
      status: 'awaiting_opponent',
      matchId,
      mySide,
      opponentSide,
      myReport: mine,
    });
  }

  // Case B: reports agree OR one side auto-wins on opponent silence + evidence
  //         → finalize (close any open dispute first).
  if (outcome.outcome === 'agreed' || outcome.outcome === 'auto_resolved') {
    // If the match is currently 'disputed', we must clear the status before
    // applyMatchScore (which refuses disputed matches).
    if (match.status === 'disputed') {
      const nowIso = new Date().toISOString();
      const { error: clearErr } = await supabaseAdmin
        .from('matches')
        .update({
          status: 'pending',
          dispute_resolution:
            outcome.outcome === 'auto_resolved'
              ? `Resolu automatiquement : ${outcome.reason}.`
              : 'Resolu automatiquement : les deux capitaines ont accorde leur report.',
          dispute_resolved_at: nowIso,
          updated_at: nowIso,
        })
        .eq('tenant_id', req.botContext.tenantId)
        .eq('id', matchId);
      if (clearErr) {
        logger.error('[bot/matches/report] clear dispute error', clearErr);
        return res
          .status(500)
          .json({ error: 'Echec de la fermeture de la dispute' });
      }
    }

    try {
      // Scrim match : pas de bracket a propager (pas de tournament_id),
      // applyMatchScore est appele avec propagateBracket=false. La logique
      // de notifications Discord interne a applyMatchScore est elle aussi
      // tournament-aware (tryAutoAdvanceFromMatch est gate sur stage_id,
      // sendMatchResultDiscord ne fait rien si tournament_id manque).
      //
      // ORIENTATION CANONIQUE : outcome.team1Score/team2Score sont deja dans
      // le repere du MATCH (team1/team2), jamais du reporter — on les passe
      // tels quels a applyMatchScore.
      const isScrim = !!match.scrim_id;
      const result = await applyMatchScore({
        tenantId: req.botContext.tenantId,
        matchId,
        team1Score: outcome.team1Score,
        team2Score: outcome.team2Score,
        markFinished: true,
        staffId: null,
        propagateBracket: !isScrim,
      });

      // Auto-award auditable : la finalisation sur silence+preuve n'a pas de
      // contexte staff, on trace la raison dans le journal des actions
      // joueuses (bot_player_actions) pour garder l'audit trail complet.
      if (outcome.outcome === 'auto_resolved') {
        void logPlayerAction({
          actorAuthUserId: reportingAuthId,
          actorDiscordUserId: discordUserId,
          action: 'report_score',
          entityType: 'match',
          entityId: matchId,
          payload: {
            auto_resolved: true,
            reason: outcome.reason,
            team1_score: outcome.team1Score,
            team2_score: outcome.team2Score,
          },
        });
      }

      return res.status(200).json({
        status: 'finalized',
        resolution: outcome.outcome,
        reason: outcome.outcome === 'auto_resolved' ? outcome.reason : null,
        matchId,
        scrimId: match.scrim_id ?? null,
        team1Score: outcome.team1Score,
        team2Score: outcome.team2Score,
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

  // Case C: needs_arbitration → open (or keep) dispute. Le motif FR depend du
  // type de conflit (desaccord des deux capitaines vs report unilateral non
  // confirmé sans preuve). L'evidenceBundle est deja rattache au match (table
  // match_evidence) : le staff le tire via GET evidence.
  const conflict = outcome.conflict;
  let reasonParts: string;
  if (conflict.kind === 'captain_disagreement') {
    reasonParts = [
      `Desaccord capitaines (via bot Discord) :`,
      `- ${team1.name} : ${conflict.side1?.team1Score ?? '?'}-${
        conflict.side1?.team2Score ?? '?'
      }`,
      `- ${team2.name} : ${conflict.side2?.team1Score ?? '?'}-${
        conflict.side2?.team2Score ?? '?'
      }`,
    ].join('\n');
  } else {
    const reportedTeamName =
      conflict.reportedSide === 1 ? team1.name : team2.name;
    reasonParts = [
      `Report unilateral non confirme (via bot Discord) :`,
      `- ${reportedTeamName} a reporte ${conflict.reported.team1Score}-${conflict.reported.team2Score}`,
      `- Adversaire silencieux au-dela du delai SLA (${slaMinutes} min) sans preuve fournie.`,
    ].join('\n');
  }

  const wasAlreadyDisputed = match.status === 'disputed';
  if (!wasAlreadyDisputed) {
    const nowIso = new Date().toISOString();

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
      .eq('tenant_id', req.botContext.tenantId)
      .eq('id', matchId);

    if (disputeErr) {
      logger.error('[bot/matches/report] open dispute error', disputeErr);
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
          openedBy: 'bot',
          openedByStaffId: null,
          enriched,
        },
        req.botContext.tenantId
      );
    })().catch((e) => logger.error('[botEvents] match.disputed emit error', e));
  }

  // Fire-and-forget Discord notification — uniquement pour les matchs de
  // tournoi. Les scrims utilisent leur propre flow admin (cf. /scrim score)
  // pour la resolution manuelle et n'ont pas besoin du canal staff support.
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
      logger.error('[bot/matches/report] dispute notify error', e)
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
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 30,
    key: 'bot-match-report',
    // Action par capitaine : on borne aussi par acteur pour qu'un seul
    // capitaine ne draine pas le bucket IP global. L'id du capitaine est
    // envoyé sous `discordUserId` (pas `actorDiscordUserId`), d'où actorField.
    perActor: { max: 5, windowMs: 60_000, actorField: 'discordUserId' },
  },
  idempotent: true,
  bodySchema: reportBodySchema,
  querySchema: reportQuerySchema,
});
