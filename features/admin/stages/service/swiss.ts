// features/admin/stages/service/swiss.ts — phases suisses : état de la
// progression et génération de la ronde suivante.
//
// Moteurs : utils/swiss/{pairing,standings,utils}. Ici, seulement la lecture
// des matchs, les seuils d'élimination réglés sur la phase (win / loss, avec
// le garde-fou « au moins 2 équipes actives ») et l'écriture des matchs.
//
// Équipes disqualifiées : retirées du pool, matchs « annul » ignorés — règle
// partagée avec le bot dans utils/swiss/pairingPool.ts.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesInsert } from '@/types/database.generated';
import { generateSwissPairings } from '@/utils/swiss/pairing';
import { computeSwissStandings } from '@/utils/swiss/standings';
import { isCountedStatus } from '@/utils/stages/countedMatches';
import { readDisqualificationMapStrict } from '@/utils/stages/disqualification';
import {
  MIN_SWISS_PAIRING_TEAMS,
  countedSwissMatches,
  eligibleSwissTeams,
  notEnoughEligibleTeamsMessage,
  unfinishedRoundMatches,
} from '@/utils/swiss/pairingPool';
import {
  defaultSwissScoreConfig,
  resultsToPastMatches,
} from '@/utils/swiss/utils';
import type {
  SwissMatchResult,
  SwissParticipant,
  SwissScoreConfig,
  SwissStandingParticipant,
} from '@/types/swiss';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { fail, settingsOrNull, stageNotFound } from './common';

type SwissMatch = {
  id: string;
  status: string;
  is_bye: boolean | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

type EliminatedTeam = {
  teamId: string;
  reason: 'win_threshold' | 'loss_threshold';
  wins: number;
  losses: number;
};

/** Victoires / défaites par équipe sur des matchs terminés (BYE = victoire). */
function winLossMaps(finished: SwissMatch[]) {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const m of finished) {
    if (!m.team1_id) continue;
    if (m.is_bye) {
      wins.set(m.team1_id, (wins.get(m.team1_id) ?? 0) + 1);
      continue;
    }
    if (!m.team2_id) continue;
    if (m.winner_team_id === m.team1_id) {
      wins.set(m.team1_id, (wins.get(m.team1_id) ?? 0) + 1);
      losses.set(m.team2_id, (losses.get(m.team2_id) ?? 0) + 1);
    } else if (m.winner_team_id === m.team2_id) {
      wins.set(m.team2_id, (wins.get(m.team2_id) ?? 0) + 1);
      losses.set(m.team1_id, (losses.get(m.team1_id) ?? 0) + 1);
    }
  }
  return { wins, losses };
}

const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' ? v : null;

/* ------------------------------ swiss-status ---------------------------- */

export async function swissStatus(ctx: ServiceContext, id: string) {
  const { row: stage, error: stageErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (stageErr || !stage) throw stageNotFound();
  if (stage.stage_type !== 'swiss') {
    throw fail(400, 'This endpoint is only for swiss stages.');
  }

  const { rows, error: matchErr } = await matches.activeStageMatches(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (matchErr) throw fail(500, 'Failed to fetch matches');
  const allMatches: SwissMatch[] = rows || [];

  const currentRound = allMatches.reduce(
    (acc, m) => Math.max(acc, m.round_number ?? 0),
    0
  );

  const settings = settingsOrNull(stage.settings);
  const totalRounds = numOrNull(settings?.total_rounds);
  const winThreshold = numOrNull(settings?.win_threshold);
  const lossThreshold = numOrNull(settings?.loss_threshold);

  const currentRoundMatches = allMatches.filter(
    (m) => m.round_number === currentRound
  );
  // Un forfait (walkover) clôt le match au même titre qu'un score.
  const finished = currentRoundMatches.filter((m) =>
    isCountedStatus(m.status)
  ).length;
  const pending = currentRoundMatches.filter(
    (m) => m.status === 'pending'
  ).length;
  const ongoing = currentRoundMatches.filter(
    (m) => m.status === 'ongoing'
  ).length;

  const { map: dq, error: dqErr } = await readDisqualificationMapStrict(
    ctx.tenantId,
    id
  );
  if (dqErr) throw fail(500, 'Failed to fetch disqualifications');

  // Même critère que la génération : un match ignoré par le classement
  // (disqualifiée « annul ») ne retient pas la ronde.
  const allCurrentRoundFinished =
    currentRound > 0 &&
    currentRoundMatches.length > 0 &&
    unfinishedRoundMatches(allMatches, dq, currentRound).length === 0;

  const { ids: registeredTeamIds } = await stages.stageTeamIds(
    ctx.db,
    ctx.tenantId,
    id
  );

  // Mêmes règles que la génération : disqualifiées hors du pool, matchs
  // « annul » ignorés pour tout le monde.
  const { wins: winsMap, losses: lossesMap } = winLossMaps(
    countedSwissMatches(allMatches, dq)
  );
  const allTeamIds = eligibleSwissTeams(
    registeredTeamIds.map((team_id) => ({ team_id })),
    dq
  ).map((t) => t.team_id);

  const eliminated: EliminatedTeam[] = [];
  const eliminatedSet = new Set<string>();

  // Phase 1 : win_threshold (qualifiées).
  for (const teamId of allTeamIds) {
    const wins = winsMap.get(teamId) ?? 0;
    if (winThreshold !== null && wins >= winThreshold) {
      eliminated.push({
        teamId,
        reason: 'win_threshold',
        wins,
        losses: lossesMap.get(teamId) ?? 0,
      });
      eliminatedSet.add(teamId);
    }
  }

  // Phase 2 : loss_threshold, en gardant au moins 2 équipes actives.
  if (lossThreshold !== null) {
    const candidates: { teamId: string; wins: number; losses: number }[] = [];
    for (const teamId of allTeamIds) {
      if (eliminatedSet.has(teamId)) continue;
      const losses = lossesMap.get(teamId) ?? 0;
      if (losses >= lossThreshold) {
        candidates.push({ teamId, wins: winsMap.get(teamId) ?? 0, losses });
      }
    }
    const maxEliminations = Math.max(
      0,
      allTeamIds.length - eliminatedSet.size - 2
    );
    candidates.sort((a, b) => b.losses - a.losses);
    for (const c of candidates.slice(
      0,
      Math.min(candidates.length, maxEliminations)
    )) {
      eliminated.push({
        teamId: c.teamId,
        reason: 'loss_threshold',
        wins: c.wins,
        losses: c.losses,
      });
      eliminatedSet.add(c.teamId);
    }
  }

  const activeCount = allTeamIds.length - eliminated.length;
  const roundLimitReached =
    totalRounds !== null &&
    currentRound >= totalRounds &&
    allCurrentRoundFinished;
  const allEliminated = allCurrentRoundFinished && activeCount <= 1;
  const isComplete = roundLimitReached || allEliminated;
  const canGenerateNext =
    allCurrentRoundFinished &&
    !isComplete &&
    (totalRounds === null || currentRound < totalRounds) &&
    activeCount > 1;

  return {
    stageId: id,
    currentRound,
    totalRounds,
    winThreshold,
    lossThreshold,
    roundStatus: {
      round: currentRound,
      total: currentRoundMatches.length,
      finished,
      pending,
      ongoing,
    },
    allCurrentRoundFinished,
    canGenerateNext,
    isComplete,
    eliminated,
    activeTeamCount: activeCount,
    totalTeamCount: registeredTeamIds.length,
  };
}

/* ------------------------- génération de ronde -------------------------- */

type SwissRoundBody = {
  roundNumber?: number;
  scoreConfig?: Partial<SwissScoreConfig>;
  allowRematchesFallback?: boolean;
  dryRun?: boolean;
  /** Confirmation explicite d'un pairing qui contient des rematches. */
  acceptRematches?: boolean;
};

/** Matchs terminés → résultats suisses selon le barème donné. */
function buildSwissResults(
  finished: SwissMatch[],
  config: SwissScoreConfig
): SwissMatchResult[] {
  const results: SwissMatchResult[] = [];
  for (const m of finished) {
    if (!isCountedStatus(m.status) || !m.team1_id) continue;
    const round = m.round_number ?? 0;

    if (m.is_bye || (!m.team2_id && m.team1_id)) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: null,
        player1Score: config.bye,
        player2Score: 0,
      });
      continue;
    }
    if (!m.team2_id) continue;

    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;
    const base = { round, player1Id: m.team1_id, player2Id: m.team2_id };
    if (m.winner_team_id === m.team1_id) {
      results.push({
        ...base,
        player1Score: config.win,
        player2Score: config.loss,
      });
    } else if (m.winner_team_id === m.team2_id) {
      results.push({
        ...base,
        player1Score: config.loss,
        player2Score: config.win,
      });
    } else if (s1 === s2) {
      results.push({
        ...base,
        player1Score: config.draw,
        player2Score: config.draw,
      });
    } else {
      // Match incohérent : aucun point.
      results.push({ ...base, player1Score: 0, player2Score: 0 });
    }
  }
  return results;
}

export async function generateSwissRound(
  ctx: ServiceContext,
  id: string,
  rawBody: Record<string, unknown>
): Promise<Audited<Record<string, unknown>>> {
  const body = rawBody as SwissRoundBody;

  const { row: stage, error: stageErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (stageErr || !stage) throw stageNotFound();
  if (stage.stage_type !== 'swiss') {
    throw fail(
      400,
      "Stage is not of type 'swiss'. This endpoint only works for swiss stages."
    );
  }
  const settings = settingsOrNull(stage.settings);
  const tournamentId = stage.tournament_id;

  const { rows: stageTeams, error: teamErr } = await stages.stageTeamsWithSeed(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (teamErr) {
    ctx.logger.error('generate-swiss-round stage_teams error:', teamErr);
    throw fail(500, 'Failed to fetch stage participants');
  }
  const participants = stageTeams || [];
  if (participants.length === 0) {
    throw fail(400, 'No participants found for this stage');
  }

  // Disqualifiées : jamais appariées (ni BYE, ni adversaire). Lecture stricte :
  // une disqualification illisible ferait apparier l'équipe.
  const { map: dq, error: dqErr } = await readDisqualificationMapStrict(
    ctx.tenantId,
    id
  );
  if (dqErr) {
    ctx.logger.error('generate-swiss-round disqualifications error:', dqErr);
    throw fail(500, 'Failed to fetch disqualifications');
  }
  const eligible = eligibleSwissTeams(participants, dq);
  if (eligible.length < MIN_SWISS_PAIRING_TEAMS) {
    throw fail(
      400,
      notEnoughEligibleTeamsMessage(
        eligible.length,
        participants.length - eligible.length
      ),
      'EMPTY_PAIRING'
    );
  }

  const { rows, error: matchesErr } = await matches.activeStageMatches(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (matchesErr) {
    ctx.logger.error('generate-swiss-round matches error:', matchesErr);
    throw fail(500, 'Failed to fetch stage matches');
  }
  const allMatches: SwissMatch[] = rows || [];

  const maxExistingRound = allMatches.reduce(
    (acc, m) => Math.max(acc, m.round_number ?? 0),
    0
  );
  const nextRound =
    typeof body.roundNumber === 'number'
      ? body.roundNumber
      : maxExistingRound + 1;
  if (nextRound <= maxExistingRound) {
    throw fail(400, 'roundNumber must be greater than existing rounds');
  }

  const totalRounds = settings?.total_rounds;
  if (
    typeof totalRounds === 'number' &&
    totalRounds > 0 &&
    nextRound > totalRounds
  ) {
    throw fail(
      400,
      `Impossible de generer le round ${nextRound} : le nombre maximum de rounds est ${totalRounds}. Modifiez les settings du stage pour augmenter total_rounds.`
    );
  }

  if (maxExistingRound > 0) {
    // Un match ignoré par le classement (disqualifiée « annul ») ne bloque pas.
    const unfinished = unfinishedRoundMatches(allMatches, dq, maxExistingRound);
    if (unfinished.length > 0) {
      throw fail(
        400,
        `${unfinished.length} match(s) du round ${maxExistingRound} ne sont pas termines. Terminez-les avant de generer le round suivant.`
      );
    }
  }

  const scoreConfig: SwissScoreConfig = {
    ...defaultSwissScoreConfig,
    ...(body.scoreConfig || {}),
  };

  // Points, Buchholz et historique anti-rematch : règles du classement.
  const pastMatches = countedSwissMatches(allMatches, dq, nextRound);
  const swissResults = buildSwissResults(pastMatches, scoreConfig);

  const standingParticipants: SwissStandingParticipant[] = participants.map(
    (p, idx) => ({
      id: p.team_id,
      name: undefined,
      seed: typeof p.seed === 'number' ? p.seed : idx + 1,
    })
  );
  const standings = computeSwissStandings({
    participants: standingParticipants,
    results: swissResults,
  });

  const scoreByTeam = new Map<string, number>();
  const hadByeSet = new Set<string>();
  for (const s of standings) {
    scoreByTeam.set(s.id, s.score);
    if (s.hadBye) hadByeSet.add(s.id);
  }
  // Filet : BYE déjà joués.
  for (const m of allMatches) {
    if (m.is_bye && m.team1_id && m.status === 'finished')
      hadByeSet.add(m.team1_id);
  }

  const winThreshold = numOrNull(settings?.win_threshold);
  const lossThreshold = numOrNull(settings?.loss_threshold);
  const { wins: winsMap, losses: lossesMap } = winLossMaps(pastMatches);

  const eliminatedTeams: EliminatedTeam[] = [];
  const eliminatedIds = new Set<string>();

  for (const p of eligible) {
    const wins = winsMap.get(p.team_id) ?? 0;
    if (winThreshold !== null && wins >= winThreshold) {
      eliminatedTeams.push({
        teamId: p.team_id,
        reason: 'win_threshold',
        wins,
        losses: lossesMap.get(p.team_id) ?? 0,
      });
      eliminatedIds.add(p.team_id);
    }
  }

  if (lossThreshold !== null) {
    const candidates: { teamId: string; wins: number; losses: number }[] = [];
    for (const p of eligible) {
      if (eliminatedIds.has(p.team_id)) continue;
      const losses = lossesMap.get(p.team_id) ?? 0;
      if (losses >= lossThreshold) {
        candidates.push({
          teamId: p.team_id,
          wins: winsMap.get(p.team_id) ?? 0,
          losses,
        });
      }
    }
    const maxEliminations = Math.max(
      0,
      eligible.length - eliminatedIds.size - 2
    );
    if (candidates.length <= maxEliminations) {
      for (const c of candidates) {
        eliminatedTeams.push({ ...c, reason: 'loss_threshold' });
        eliminatedIds.add(c.teamId);
      }
    } else if (maxEliminations > 0) {
      candidates.sort((a, b) => b.losses - a.losses);
      for (let i = 0; i < maxEliminations; i++) {
        const c = candidates[i];
        eliminatedTeams.push({ ...c, reason: 'loss_threshold' });
        eliminatedIds.add(c.teamId);
      }
    }
  }

  const active = eligible.filter((p) => !eliminatedIds.has(p.team_id));

  // Phase terminée (≤ 1 équipe active) : on la clôt. Pas de journal (origine).
  if (active.length <= 1) {
    await stages.patchStage(ctx.db, ctx.tenantId, id, { is_active: false });
    return {
      result: {
        stageId: id,
        tournamentId,
        roundNumber: nextRound,
        hasRematches: false,
        eliminatedTeams,
        stageCompleted: true,
      },
      audit: { skip: true },
    };
  }

  const pairingParticipants: SwissParticipant[] = active.map((p, idx) => ({
    id: p.team_id,
    score: scoreByTeam.get(p.team_id) ?? 0,
    seed: typeof p.seed === 'number' ? p.seed : idx + 1,
    hadBye: hadByeSet.has(p.team_id),
  }));

  const { pairings, hasRematches } = generateSwissPairings({
    participants: pairingParticipants,
    pastMatches: resultsToPastMatches(swissResults),
    allowRematchesFallback: body.allowRematchesFallback ?? true,
  });

  if (pairings.length === 0) {
    throw fail(400, 'Swiss pairing produced no matches');
  }

  // Rematches : insertion seulement sur confirmation explicite (le dry run,
  // lui, les prévisualise sans confirmation — c'est ce qui l'alimente).
  if (hasRematches && !body.dryRun && body.acceptRematches !== true) {
    throw fail(
      409,
      'Le pairing genere contient des rematches. Confirme l’insertion en renvoyant acceptRematches=true.',
      undefined,
      { detail: 'REMATCHES_REQUIRE_CONFIRMATION' }
    );
  }

  if (body.dryRun) {
    const teamRows = await related.teamNames(
      ctx.db,
      ctx.tenantId,
      participants.map((p) => p.team_id)
    );
    const nameOf = new Map<string, string | null>();
    for (const t of teamRows) nameOf.set(t.id, t.name ?? t.short_name ?? null);

    return {
      result: {
        stageId: id,
        tournamentId,
        roundNumber: nextRound,
        hasRematches,
        dryRun: true,
        preview: pairings.map((p) => ({
          team1_id: p.player1Id,
          team1_name: nameOf.get(p.player1Id) ?? null,
          team2_id: p.player2Id ?? null,
          team2_name: p.player2Id ? (nameOf.get(p.player2Id) ?? null) : null,
          is_bye: p.isBye,
          team1_score: p.isBye ? (scoreConfig.bye ?? 1) : 0,
          team2_score: 0,
        })),
        ...(eliminatedTeams.length > 0 ? { eliminatedTeams } : {}),
      },
      audit: { skip: true },
    };
  }

  const nowIso = new Date().toISOString();
  const matchFormat = settings?.match_format ?? 'bo3';
  const common = {
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    stage_id: id,
    match_format: matchFormat,
    round_name: `Round ${nextRound}`,
    round_number: nextRound,
    bracket_side: 'none',
    group_key: null,
    scheduled_at: null,
    stream_url: null,
    lobby_code: null,
    notes: null,
    next_match_win_id: null,
    next_match_win_slot: null,
    next_match_lose_id: null,
    next_match_lose_slot: null,
    created_at: nowIso,
    updated_at: null,
  };
  const inserts: TablesInsert<'matches'>[] = pairings.map((p) =>
    p.isBye
      ? {
          ...common,
          // BYE : terminé immédiatement.
          status: 'finished',
          is_bye: true,
          team1_id: p.player1Id,
          team2_id: null,
          team1_score: scoreConfig.bye ?? 1,
          team2_score: 0,
          winner_team_id: p.player1Id,
          completed_at: nowIso,
        }
      : {
          ...common,
          status: 'pending',
          is_bye: false,
          team1_id: p.player1Id,
          team2_id: p.player2Id,
          team1_score: null,
          team2_score: null,
          winner_team_id: null,
          completed_at: null,
        }
  );

  const { rows: inserted, error: insertErr } = await matches.insertSwissMatches(
    ctx.db,
    inserts
  );
  if (insertErr || !inserted) {
    ctx.logger.error('generate-swiss-round insert matches error:', insertErr);
    throw fail(500, 'Failed to insert swiss matches');
  }

  const byeMatch = inserted.find((m) => m.is_bye) ?? null;

  return {
    result: {
      stageId: id,
      tournamentId,
      roundNumber: nextRound,
      hasRematches,
      createdMatches: inserted,
      byeMatchId: byeMatch?.id ?? null,
      ...(eliminatedTeams.length > 0 ? { eliminatedTeams } : {}),
    },
    audit: {
      entity_type: 'stage',
      entity_id: id,
      tournament_id: tournamentId,
      payload: {
        stage_id: id,
        round_number: nextRound,
        created_match_ids: inserted.map((m) => m.id),
        has_rematches: hasRematches,
      },
    },
  };
}
