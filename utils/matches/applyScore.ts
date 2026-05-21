// lib/matches/applyScore.ts
// Helper serveur pour appliquer un score à un match,
// calculer le vainqueur et propager dans le bracket.
import { supabaseAdmin } from '../supabase';
import {
  resetPropagationForMatch,
  propagateBracketForMatch,
  snapshotPropagationSlots,
  restorePropagationSlots,
} from '../bracket/propagate';
import type { PropagationSnapshot } from '../bracket/propagate';
import { createBracketSnapshot } from '../bracket/snapshot';
import { logStaffAction } from '../staffLogs';
import { computeRequiredWins } from './computeRequiredWins';
import { invalidateStandingsCache } from '../stages/standingsCache';
import { tryAutoAdvanceFromMatch } from '../stages/autoAdvance';
import {
  notifyMatchResult,
  notifyBracketUpdate,
  postMvpPoll,
} from '../discord';
import { emitBotEvent } from '../botEvents';
import { enrichMatchEvent } from './botEventEnrich';
import type { PropagationResult } from '../../types/bracket';
import { logger } from '../logger';
import type {
  ApplyMatchScoreInput,
  ApplyMatchScoreResult,
  MatchStatus,
} from '../../types/matches';

/** Statuses that trigger bracket propagation (match has a winner) */
const PROPAGATION_STATUSES: MatchStatus[] = ['finished', 'walkover'];

/* -----------------------------------------------------------
 * Fonction principale
 * ---------------------------------------------------------*/

/**
 * Applique un score à un match :
 * - met à jour team1_score / team2_score
 * - calcule le winner_team_id (si non reçu en entrée)
 * - gère les forfeits (score automatique + winner basé sur l'équipe adverse)
 * - optionnellement marque le match comme "finished" ou "walkover"
 * - met à jour completed_at si terminé
 * - reset puis propage la progression dans le bracket
 * - log l'action staff dans staff_logs
 */
export async function applyMatchScore(
  input: ApplyMatchScoreInput
): Promise<ApplyMatchScoreResult> {
  const {
    tenantId,
    matchId,
    status,
    winnerTeamId,
    markFinished = true,
    completedAt,
    staffId,
    propagateBracket = true,
    forfeitTeamId,
  } = input;

  let { team1Score, team2Score } = input;

  // Marque le match comme NEEDS_REVIEW dans staff_logs : a appeler quand un
  // rollback echoue (l'etat de la base peut etre incoherent et requiert un audit).
  const markNeedsReview = async (
    context: string,
    rollbackError: unknown,
    extra: Record<string, unknown> = {}
  ) => {
    if (!staffId) return; // pas de contexte staff -> reste en logger.error uniquement
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'other',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: extra.tournamentId as string | null | undefined ?? null,
        payload: {
          needs_review: true,
          context,
          rollback_error:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
          ...extra,
        },
      });
    } catch (logErr) {
      logger.error('applyMatchScore: needs_review log failed', logErr);
    }
  };

  // 1) Récupérer le match actuel
  //    updated_at est lu pour servir de jeton d'optimistic lock plus bas
  //    (cf. step 9). Si une autre transaction écrit le match entre cette
  //    lecture et notre UPDATE, le `updated_at` aura changé et le UPDATE
  //    ne matchera 0 ligne -> on déclenche le rollback proprement plutôt
  //    que d'appliquer deux fois la propagation bracket.
  const { data: match, error: fetchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      stage_id,
      status,
      is_bye,
      match_format,
      team1_id,
      team2_id,
      team1_score,
      team2_score,
      winner_team_id,
      forfeit_team_id,
      completed_at,
      updated_at,
      veto_locked_at,
      next_match_win_id,
      next_match_win_slot,
      next_match_lose_id,
      next_match_lose_slot
    `
    )
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (fetchErr || !match) {
    logger.error('applyMatchScore: fetch match error', fetchErr);
    throw new Error('Match introuvable');
  }

  // 1b) Vérifier que le tournoi n'est pas terminé (completed)
  if (match.tournament_id) {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('id', match.tournament_id)
      .maybeSingle();

    if (tournament?.status === 'completed') {
      throw new Error(
        'Impossible de modifier le score : le tournoi est terminé (status=completed). Réouvrez le tournoi pour effectuer des modifications.'
      );
    }
  }

  // 1b-bis) Bloquer toute modification de score tant qu'une dispute est ouverte.
  // Le seul chemin legitime pour repasser sur un match en dispute est l'API
  // /api/admin/matches/[matchId]/dispute (PATCH), qui retire d'abord le status
  // 'disputed' avant d'appeler applyMatchScore.
  if (match.status === 'disputed') {
    throw new Error(
      'Impossible de modifier ce match : il est en dispute. Resolvez la dispute via la page admin avant de modifier le score.'
    );
  }

  // 1c) Gestion du forfait : auto-calcul score + winner
  let resolvedForfeitTeamId: string | null = forfeitTeamId ?? null;

  if (resolvedForfeitTeamId) {
    // Vérifier que l'équipe forfait fait partie du match
    if (
      resolvedForfeitTeamId !== match.team1_id &&
      resolvedForfeitTeamId !== match.team2_id
    ) {
      throw new Error(
        `L'équipe forfait (${resolvedForfeitTeamId}) ne fait pas partie de ce match`
      );
    }

    // Si les scores ne sont pas fournis explicitement, les calculer automatiquement
    if (team1Score === undefined && team2Score === undefined) {
      const requiredWins = computeRequiredWins(match.match_format);
      // L'équipe forfait obtient 0, l'adversaire obtient le nombre de wins requis
      if (resolvedForfeitTeamId === match.team1_id) {
        team1Score = 0;
        team2Score = requiredWins;
      } else {
        team1Score = requiredWins;
        team2Score = 0;
      }
    }
  }

  // 0) Validation des scores (après résolution forfait)
  if (
    typeof team1Score !== 'number' ||
    typeof team2Score !== 'number' ||
    !Number.isInteger(team1Score) ||
    !Number.isInteger(team2Score) ||
    team1Score < 0 ||
    team2Score < 0
  ) {
    throw new Error(
      'Scores invalides : team1Score et team2Score doivent être des entiers >= 0'
    );
  }

  const currentStatus: MatchStatus = match.status;

  // 2) Déterminer le status cible
  let newStatus: MatchStatus = currentStatus;

  if (status) {
    newStatus = status;
  } else if (resolvedForfeitTeamId) {
    newStatus = 'walkover';
  } else if (markFinished) {
    newStatus = 'finished';
  }

  // 3) Calculer le vainqueur si besoin
  let newWinnerTeamId: string | null;

  if (resolvedForfeitTeamId) {
    // En cas de forfait, le vainqueur est l'adversaire
    newWinnerTeamId =
      typeof winnerTeamId !== 'undefined'
        ? winnerTeamId
        : resolvedForfeitTeamId === match.team1_id
          ? match.team2_id
          : match.team1_id;
  } else {
    newWinnerTeamId =
      typeof winnerTeamId !== 'undefined'
        ? winnerTeamId
        : computeWinnerFromScores(
            match.team1_id,
            match.team2_id,
            team1Score,
            team2Score,
            match.is_bye
          );
  }

  // 4) Déterminer completed_at
  let newCompletedAt: string | null = match.completed_at;
  if (PROPAGATION_STATUSES.includes(newStatus)) {
    newCompletedAt = completedAt || new Date().toISOString();
  }

  // 4b) Fast-path idempotent : si le match est déjà dans un état terminal
  //     identique (mêmes scores, même winner, même forfeit), on sort tout
  //     de suite sans toucher au bracket, au cache standings, ni aux
  //     notifications Discord. Couvre les rejeux (retry après timeout,
  //     double-submit capitaine, ré-application admin idempotente).
  //     Sans ce garde, on émettrait à nouveau match.finished + on
  //     re-propagerait dans le bracket → progression dupliquée.
  const sameStatus = newStatus === currentStatus;
  const sameScores =
    match.team1_score === team1Score && match.team2_score === team2Score;
  const sameWinner = (match.winner_team_id ?? null) === (newWinnerTeamId ?? null);
  const sameForfeit =
    resolvedForfeitTeamId === null
      ? !match.forfeit_team_id
      : match.forfeit_team_id === resolvedForfeitTeamId;

  if (
    sameStatus &&
    PROPAGATION_STATUSES.includes(currentStatus) &&
    sameScores &&
    sameWinner &&
    sameForfeit
  ) {
    logger.info('applyMatchScore: no-op idempotent (match déjà appliqué)', {
      matchId,
      status: currentStatus,
    });
    return {
      matchId,
      updated: false,
      match,
      winnerTeamId: match.winner_team_id ?? null,
    };
  }

  // 5) Préparer la payload d'update
  const updatePayload: Record<string, any> = {
    team1_score: team1Score,
    team2_score: team2Score,
    winner_team_id: newWinnerTeamId,
  };

  if (resolvedForfeitTeamId !== undefined) {
    updatePayload.forfeit_team_id = resolvedForfeitTeamId;
  }

  if (newStatus !== currentStatus) {
    updatePayload.status = newStatus;
  }

  if (PROPAGATION_STATUSES.includes(newStatus)) {
    updatePayload.completed_at = newCompletedAt;
  }

  // Auto-lock du veto au passage en statut terminal (finished/walkover) :
  // une fois le match termine, le veto ne doit plus pouvoir etre modifie.
  // Si deja locke (ex: passe par 'ongoing' d'abord), on garde le timestamp
  // d'origine pour preserver l'historique reel du verrouillage.
  if (
    PROPAGATION_STATUSES.includes(newStatus) &&
    !match.veto_locked_at
  ) {
    updatePayload.veto_locked_at = newCompletedAt;
  }

  // 6) Sauvegarder l'état précédent pour rollback éventuel
  const previousMatchState = {
    team1_score: match.team1_score,
    team2_score: match.team2_score,
    winner_team_id: match.winner_team_id,
    forfeit_team_id: match.forfeit_team_id,
    status: match.status,
    completed_at: match.completed_at,
    veto_locked_at: match.veto_locked_at,
  };

  // Statuses qui bloquent la propagation
  const shouldPropagate =
    propagateBracket && PROPAGATION_STATUSES.includes(newStatus);

  // 7a) Snapshot bracket complet (persistant en DB) AVANT toute mutation
  //     propagante. Permet à un admin de rollback large via
  //     /admin/stages/[id]/snapshots. Best-effort : si l'insert échoue,
  //     on log côté snapshot.ts et on continue (le rollback in-memory
  //     reste actif via snapshotPropagationSlots ci-dessous).
  if (shouldPropagate && match.stage_id) {
    void createBracketSnapshot({
      stageId: match.stage_id,
      reason: 'apply_score',
      staffId: staffId ?? null,
    }).catch((e) =>
      logger.error('applyMatchScore: createBracketSnapshot failed', e)
    );
  }

  // 7) Snapshot des slots de propagation AVANT le reset,
  //    pour pouvoir restaurer l'état complet en cas d'échec.
  let propagationSnapshot: PropagationSnapshot | null = null;
  if (propagateBracket) {
    propagationSnapshot = await snapshotPropagationSlots(tenantId, matchId);
  }

  // 8) Reset propagation avant de changer les équipes
  if (propagateBracket) {
    try {
      await resetPropagationForMatch(tenantId, matchId);
    } catch (e) {
      // Si le reset échoue, restaurer le snapshot et abandonner
      if (propagationSnapshot) {
        await restorePropagationSlots(tenantId, propagationSnapshot).catch(async (re) => {
          logger.error(
            'applyMatchScore: restore after reset failure failed',
            re
          );
          await markNeedsReview('restore-after-reset-failed', re, {
            tournamentId: match.tournament_id,
          });
        });
      }
      throw new Error(
        `Reset de la propagation échoué. Aucune modification appliquée. Détail : ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  // 9) Update du match avec optimistic lock sur updated_at.
  //    Si une autre transaction a modifié le match entre l'étape 1 (fetch)
  //    et maintenant, le `eq('updated_at', match.updated_at)` ne matche plus
  //    et `updated` revient null → on bascule sur le chemin rollback ci-dessous.
  //    Le nouveau updated_at est positionné explicitement pour donner aux
  //    consommateurs un repère temporel de la modification.
  const updatePayloadFinal: Record<string, any> = {
    ...updatePayload,
    updated_at: new Date().toISOString(),
  };
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('matches')
    .update(updatePayloadFinal)
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .eq('updated_at', match.updated_at)
    .select('*')
    .maybeSingle();

  if (updateErr || !updated) {
    const concurrent = !updateErr && !updated;
    if (concurrent) {
      logger.warn('applyMatchScore: optimistic lock conflict', {
        matchId,
        expectedUpdatedAt: match.updated_at,
      });
    } else {
      logger.error('applyMatchScore: update match error', updateErr);
    }

    // Rollback : restaurer les slots de propagation vidés par le reset
    if (propagationSnapshot) {
      await restorePropagationSlots(tenantId, propagationSnapshot).catch(async (re) => {
        logger.error(
          'applyMatchScore: restore after update failure failed',
          re
        );
        await markNeedsReview('restore-after-update-failed', re, {
          tournamentId: match.tournament_id,
        });
      });
    }

    if (!updateErr && !updated) {
      throw new Error(
        'Le match a été modifié par une autre opération depuis le début de cet appel. Aucune modification appliquée — relire et réessayer.'
      );
    }
    throw new Error('Erreur lors de la mise à jour du match');
  }

  // 9b) Invalider le cache standings si le match appartient à un stage
  if (match.stage_id) {
    invalidateStandingsCache(match.stage_id);
  }

  // 10) Propagation du vainqueur/perdant dans le bracket
  //     En cas d'échec, on rollback le match ET les slots de propagation
  //     pour éviter une incohérence bracket.
  let propagationResult: PropagationResult | null = null;
  if (shouldPropagate) {
    try {
      propagationResult = await propagateBracketForMatch(tenantId, matchId);
    } catch (e) {
      logger.error(
        'applyMatchScore: propagateBracketForMatch error — rollback',
        e
      );

      // Rollback complet : match + slots de propagation
      const rollbackOps: Promise<any>[] = [
        Promise.resolve(
          supabaseAdmin
            .from('matches')
            .update(previousMatchState)
            .eq('tenant_id', tenantId)
            .eq('id', matchId)
        ).then(async ({ error: rollbackErr }) => {
          if (rollbackErr) {
            logger.error(
              'applyMatchScore: match rollback failed!',
              rollbackErr
            );
            await markNeedsReview(
              'match-rollback-after-propagation-failed',
              rollbackErr,
              {
                tournamentId: match.tournament_id,
                attemptedState: previousMatchState,
              }
            );
          }
        }),
      ];

      if (propagationSnapshot) {
        rollbackOps.push(
          restorePropagationSlots(tenantId, propagationSnapshot).catch(async (re) => {
            logger.error(
              'applyMatchScore: propagation slot restore failed',
              re
            );
            await markNeedsReview(
              'propagation-restore-after-propagation-failed',
              re,
              { tournamentId: match.tournament_id }
            );
          })
        );
      }

      await Promise.all(rollbackOps);

      throw new Error(
        `Propagation bracket échouée, match et bracket restaurés à leur état précédent. Détail : ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  // 11) Log staff
  if (staffId) {
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'update_match',
        entity_type: 'match',
        entity_id: matchId,
        tournament_id: match.tournament_id || null,
        payload: {
          prev_status: currentStatus,
          new_status: newStatus,
          prev_team1_score: match.team1_score,
          prev_team2_score: match.team2_score,
          new_team1_score: team1Score,
          new_team2_score: team2Score,
          prev_winner_team_id: match.winner_team_id,
          new_winner_team_id: newWinnerTeamId,
          ...(resolvedForfeitTeamId
            ? { forfeit_team_id: resolvedForfeitTeamId }
            : {}),
        },
      });
    } catch (e) {
      logger.error('applyMatchScore: logStaffAction error', e);
    }
  }

  // 12) Discord notifications (fire-and-forget)
  if (PROPAGATION_STATUSES.includes(newStatus)) {
    void sendMatchResultDiscord({
      tenantId,
      matchId,
      tournamentId: match.tournament_id ?? null,
      team1Id: match.team1_id ?? null,
      team2Id: match.team2_id ?? null,
      team1Score: team1Score,
      team2Score: team2Score,
      winnerTeamId: newWinnerTeamId,
      isForfeit: !!resolvedForfeitTeamId,
      propagationResult,
    }).catch((e) => logger.error('[discord] match result/bracket error:', e));

    // Bot push : "match.finished" — laisse le bot crosspost/reformatter
    // l'annonce (le webhook Discord direct reste, le bot vient en sus).
    // Enrich pour le rafraichissement du thread #matchs-live (couleur verte +
    // score final + archive). Si le fetch echoue, on emit avec enriched=null
    // et le bot saura le gerer (le payload de base contient deja les scores).
    void (async () => {
      const enriched = await enrichMatchEvent(matchId);
      await emitBotEvent(
        'match.finished',
        {
          matchId,
          tournamentId: match.tournament_id ?? null,
          stageId: match.stage_id ?? null,
          team1Id: match.team1_id ?? null,
          team2Id: match.team2_id ?? null,
          team1Score,
          team2Score,
          winnerTeamId: newWinnerTeamId,
          isForfeit: !!resolvedForfeitTeamId,
          forfeitTeamId: resolvedForfeitTeamId,
          status: newStatus,
          propagation: propagationResult
            ? {
                winnerTeamId: propagationResult.winnerTeamId ?? null,
                loserTeamId: propagationResult.loserTeamId ?? null,
                nextWinMatchId: propagationResult.updatedWinMatchId ?? null,
                nextLoseMatchId: propagationResult.updatedLoseMatchId ?? null,
              }
            : null,
          enriched,
        },
        tenantId
      );
    })().catch((e) =>
      logger.error('[botEvents] match.finished emit error:', e)
    );

    // MVP poll: only on real finishes (not forfeits — there's no game to vote
    // an MVP for). Fire-and-forget; failures are logged but don't block.
    if (newStatus === 'finished' && !resolvedForfeitTeamId) {
      void sendMvpPollForMatch({
        tenantId,
        matchId,
        tournamentId: match.tournament_id ?? null,
        team1Id: match.team1_id ?? null,
        team2Id: match.team2_id ?? null,
      }).catch((e: unknown) => logger.error('[discord] mvp poll error:', e));
    }

    // Auto-advance: si tous les matchs du stage source sont termines et que
    // advancement_rules est configure, on inscrit automatiquement les top N
    // dans le stage cible. Idempotent (cf. utils/stages/autoAdvance.ts).
    // Fire-and-forget : ne doit pas bloquer la reponse au client.
    if (match.stage_id) {
      void tryAutoAdvanceFromMatch({
        tenantId,
        stageId: match.stage_id,
        staffId: staffId ?? null,
      }).catch((e: unknown) => logger.error('[autoAdvance] error:', e));
    }
  }

  return {
    matchId,
    updated: true,
    match: updated,
    winnerTeamId: newWinnerTeamId,
  };
}

/* -----------------------------------------------------------
 * Discord notifications: match result + bracket update
 * ---------------------------------------------------------*/

async function sendMatchResultDiscord(params: {
  tenantId: string;
  matchId: string;
  tournamentId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  team1Score: number;
  team2Score: number;
  winnerTeamId: string | null;
  isForfeit: boolean;
  propagationResult: PropagationResult | null;
}): Promise<void> {
  const teamIds = [params.team1Id, params.team2Id].filter(
    (id): id is string => !!id
  );
  if (teamIds.length === 0) return;

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('tenant_id', params.tenantId)
    .in('id', teamIds);

  const byId = new Map<string, { name: string; logo_url: string | null }>();
  for (const t of teams || []) {
    byId.set(t.id, { name: t.name, logo_url: t.logo_url ?? null });
  }

  const team1 = params.team1Id ? byId.get(params.team1Id) : null;
  const team2 = params.team2Id ? byId.get(params.team2Id) : null;

  if (!team1 || !team2) return;

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('round_name, tournament:tournament_id(name)')
    .eq('tenant_id', params.tenantId)
    .eq('id', params.matchId)
    .maybeSingle();

  const tournamentRel = match?.tournament as
    | { name: string }
    | { name: string }[]
    | null
    | undefined;
  const tournamentName = Array.isArray(tournamentRel)
    ? (tournamentRel[0]?.name ?? null)
    : (tournamentRel?.name ?? null);

  // Match result notification
  await notifyMatchResult({
    tournamentId: params.tournamentId,
    tournamentName,
    matchId: params.matchId,
    roundName: match?.round_name ?? null,
    team1: { name: team1.name, logoUrl: team1.logo_url },
    team2: { name: team2.name, logoUrl: team2.logo_url },
    team1Score: params.team1Score,
    team2Score: params.team2Score,
    winnerTeamId: params.winnerTeamId,
    team1Id: params.team1Id,
    team2Id: params.team2Id,
    isForfeit: params.isForfeit,
  });

  // Bracket update notification (only if propagation actually moved a team)
  const propag = params.propagationResult;
  if (!propag || !propag.winnerTeamId || !propag.updatedWinMatchId) return;

  const winnerName = byId.get(propag.winnerTeamId)?.name;
  if (!winnerName) return;

  // Look up next match to figure out the next opponent (if any)
  const { data: nextMatch } = await supabaseAdmin
    .from('matches')
    .select('round_name, team1_id, team2_id')
    .eq('tenant_id', params.tenantId)
    .eq('id', propag.updatedWinMatchId)
    .maybeSingle();

  let nextOpponentName: string | null = null;
  if (nextMatch) {
    const opponentId =
      nextMatch.team1_id && nextMatch.team1_id !== propag.winnerTeamId
        ? nextMatch.team1_id
        : nextMatch.team2_id && nextMatch.team2_id !== propag.winnerTeamId
          ? nextMatch.team2_id
          : null;
    if (opponentId) {
      const { data: opponent } = await supabaseAdmin
        .from('teams')
        .select('name')
        .eq('tenant_id', params.tenantId)
        .eq('id', opponentId)
        .maybeSingle();
      nextOpponentName = opponent?.name ?? null;
    }
  }

  const loserName = propag.loserTeamId
    ? (byId.get(propag.loserTeamId)?.name ?? null)
    : null;

  await notifyBracketUpdate({
    tournamentId: params.tournamentId,
    tournamentName,
    winnerName,
    loserName,
    nextRoundName: nextMatch?.round_name ?? null,
    nextOpponentName,
  });
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

/**
 * Calcule le vainqueur à partir des scores et des IDs d'équipes.
 * - en cas de bye : l'équipe présente gagne automatiquement
 * - en cas d'égalité : pas de vainqueur (null)
 */
export function computeWinnerFromScores(
  team1Id: string | null,
  team2Id: string | null,
  team1Score: number,
  team2Score: number,
  isBye: boolean | null
): string | null {
  if (isBye) {
    return team1Id || team2Id || null;
  }

  if (!team1Id || !team2Id) {
    // match mal configuré, on ne déduit rien
    return null;
  }

  if (team1Score > team2Score) {
    return team1Id;
  }
  if (team2Score > team1Score) {
    return team2Id;
  }

  // égalité → aucun vainqueur défini par défaut
  return null;
}

/* -----------------------------------------------------------
 * MVP poll auto-post (after a real "finished" match)
 * ---------------------------------------------------------*/

async function sendMvpPollForMatch(params: {
  tenantId: string;
  matchId: string;
  tournamentId: string | null;
  team1Id: string | null;
  team2Id: string | null;
}): Promise<void> {
  if (!params.team1Id || !params.team2Id) return;

  // Skip if a poll was already posted for this match (idempotency)
  const { data: existing } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('id, posted_at')
    .eq('tenant_id', params.tenantId)
    .eq('match_id', params.matchId)
    .maybeSingle();

  if (existing?.posted_at) return;

  // Fetch team names + non-substitute roster
  const teamIds = [params.team1Id, params.team2Id];
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', params.tenantId)
    .in('id', teamIds);

  const teamById = new Map<string, string>();
  for (const t of teams || []) teamById.set(t.id, t.name);
  const team1Name = teamById.get(params.team1Id) || 'Équipe 1';
  const team2Name = teamById.get(params.team2Id) || 'Équipe 2';

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id, battle_tag, is_substitute')
    .eq('tenant_id', params.tenantId)
    .in('team_id', teamIds);

  const candidates = (members || [])
    .filter((m: any) => !m.is_substitute && m.battle_tag)
    .map((m: any) => ({
      id: m.id as string,
      teamId: m.team_id as string,
      battleTag: m.battle_tag as string,
    }))
    // Discord native polls: max 10 answers
    .slice(0, 10);

  if (candidates.length < 2) return; // Discord requires >=2 answers

  const teamShort: Record<string, string> = {
    [params.team1Id]: team1Name.slice(0, 12),
    [params.team2Id]: team2Name.slice(0, 12),
  };

  const pollAnswers = candidates.map((c) => ({
    displayLabel: `[${teamShort[c.teamId] || '?'}] ${c.battleTag}`,
  }));

  const result = await postMvpPoll({
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    team1Name,
    team2Name,
    candidates: pollAnswers,
    durationHours: 24,
  });

  if (!result.posted) return;

  // Persist the poll state (candidates, posted_at)
  const candidateIds = candidates.map((c) => c.id);

  if (existing?.id) {
    await supabaseAdmin
      .from('match_mvp_polls')
      .update({
        posted_at: new Date().toISOString(),
        duration_hours: 24,
        candidate_player_ids: candidateIds,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', params.tenantId)
      .eq('id', existing.id);
  } else {
    await supabaseAdmin.from('match_mvp_polls').insert({
      tenant_id: params.tenantId,
      match_id: params.matchId,
      posted_at: new Date().toISOString(),
      duration_hours: 24,
      candidate_player_ids: candidateIds,
    });
  }
}
