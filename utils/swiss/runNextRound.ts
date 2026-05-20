// utils/swiss/runNextRound.ts
//
// Generation du round Swiss suivant pour une phase, utilise par le bot
// Discord (POST /api/bot/v1/stages/[id]/next-round). Logique compacte qui
// couvre 80% du cas (dry-run, accept-rematches) ; les seuils win/loss et
// l'elimination automatique restent geres uniquement par l'admin UI
// (/api/admin/stages/[id]/generate-swiss-round) — si la phase utilise ces
// settings, on refuse et on renvoie le code 'USE_ADMIN_UI'.
//
// Pattern :
//   - dryRun=true                                  -> renvoie preview, n'insere rien
//   - hasRematches && acceptRematches!==true       -> 409 REMATCHES_PRESENT + preview
//   - sinon                                        -> insere les matchs + renvoie createdMatches

import { supabaseAdmin } from '../supabase';
import { computeSwissStandings } from './standings';
import { generateSwissPairings } from './pairing';
import { defaultSwissScoreConfig, resultsToPastMatches } from './utils';
import type {
  SwissMatchResult,
  SwissScoreConfig,
  SwissStandingParticipant,
  SwissParticipant as PairingParticipant,
} from '../../types/swiss';
import type { MatchStatus } from '../../types/admin';
import type { SwissSettings } from '../../types/stages';

export type RunNextRoundInput = {
  /**
   * Multi-tenant (S3) : scope toutes les queries/inserts à ce tenant. Le bot
   * caller passe `req.botContext!.tenantId`. Le helper propage `tenant_id`
   * sur les matches insérés.
   */
  tenantId: string;
  stageId: string;
  /** Defaults to max(existing round) + 1. */
  roundNumber?: number;
  /** Partial override of the score config used to compute standings. */
  scoreConfig?: Partial<SwissScoreConfig>;
  /** Required when pairings would create a rematch. */
  acceptRematches?: boolean;
  /** Return preview without inserting. */
  dryRun?: boolean;
  /** Allow pairing to fall back on rematches when no rematch-free solution. */
  allowRematchesFallback?: boolean;
};

export type PreviewPairing = {
  team1Id: string;
  team1Name: string | null;
  team2Id: string | null;
  team2Name: string | null;
  isBye: boolean;
};

export type RunNextRoundResult =
  | {
      ok: true;
      mode: 'dry-run' | 'inserted';
      stageId: string;
      tournamentId: string;
      roundNumber: number;
      hasRematches: boolean;
      preview: PreviewPairing[];
      /** Empty in dry-run mode. */
      createdMatchIds: string[];
    }
  | {
      ok: false;
      status: number;
      code:
        | 'STAGE_NOT_FOUND'
        | 'NOT_SWISS'
        | 'NO_PARTICIPANTS'
        | 'ROUND_TOO_SMALL'
        | 'ROUND_BEYOND_TOTAL'
        | 'UNFINISHED_PREVIOUS_ROUND'
        | 'EMPTY_PAIRING'
        | 'REMATCHES_PRESENT'
        | 'USE_ADMIN_UI'
        | 'DB_ERROR';
      error: string;
      /** Set on REMATCHES_PRESENT to help the caller render a confirmation prompt. */
      preview?: PreviewPairing[];
      hasRematches?: boolean;
      roundNumber?: number;
    };

type StageRow = {
  id: string;
  tournament_id: string;
  stage_type: string | null;
  name: string;
  settings: SwissSettings | null;
};

type DbMatchRow = {
  id: string;
  status: MatchStatus;
  is_bye: boolean | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

type StageTeamRow = { team_id: string; seed: number | null };

function buildSwissResultsFromMatches(
  matches: DbMatchRow[],
  config: SwissScoreConfig
): SwissMatchResult[] {
  const results: SwissMatchResult[] = [];
  for (const m of matches) {
    if (m.status !== 'finished') continue;
    if (!m.team1_id) continue;
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
    if (m.winner_team_id === m.team1_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.win,
        player2Score: config.loss,
      });
    } else if (m.winner_team_id === m.team2_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.loss,
        player2Score: config.win,
      });
    } else if ((m.team1_score ?? 0) === (m.team2_score ?? 0)) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.draw,
        player2Score: config.draw,
      });
    }
  }
  return results;
}

export async function runSwissNextRound(
  input: RunNextRoundInput
): Promise<RunNextRoundResult> {
  if (!supabaseAdmin) {
    return { ok: false, status: 503, code: 'DB_ERROR', error: 'Service indisponible.' };
  }

  // 1) Stage
  const { data: stageData, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, name, settings')
    .eq('tenant_id', input.tenantId)
    .eq('id', input.stageId)
    .maybeSingle();
  if (stageErr) {
    return { ok: false, status: 500, code: 'DB_ERROR', error: stageErr.message };
  }
  if (!stageData) {
    return { ok: false, status: 404, code: 'STAGE_NOT_FOUND', error: 'Stage introuvable.' };
  }
  const stage = stageData as StageRow;
  if (stage.stage_type !== 'swiss') {
    return {
      ok: false,
      status: 400,
      code: 'NOT_SWISS',
      error: "La phase n'est pas de type 'swiss'.",
    };
  }

  // Refuse les seuils win/loss : feature out-of-scope cote bot pour P3.
  const settings = stage.settings ?? {};
  if (
    typeof settings.win_threshold === 'number' ||
    typeof settings.loss_threshold === 'number'
  ) {
    return {
      ok: false,
      status: 400,
      code: 'USE_ADMIN_UI',
      error:
        "Cette phase utilise des seuils d'elimination (win_threshold / loss_threshold). Utilise l'admin UI pour generer le round suivant.",
    };
  }

  // 2) Participants
  const { data: stRows, error: stErr } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id, seed')
    .eq('tenant_id', input.tenantId)
    .eq('stage_id', stage.id);
  if (stErr) {
    return { ok: false, status: 500, code: 'DB_ERROR', error: stErr.message };
  }
  const participants = (stRows ?? []) as StageTeamRow[];
  if (participants.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'NO_PARTICIPANTS',
      error: 'Aucune equipe inscrite a cette phase.',
    };
  }

  // 3) Matchs existants
  const { data: matchesRaw, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, is_bye, round_number, team1_id, team2_id, winner_team_id, team1_score, team2_score'
    )
    .eq('tenant_id', input.tenantId)
    .eq('stage_id', stage.id)
    .neq('status', 'cancelled');
  if (mErr) {
    return { ok: false, status: 500, code: 'DB_ERROR', error: mErr.message };
  }
  const allMatches = (matchesRaw ?? []) as DbMatchRow[];

  const maxExistingRound = allMatches.reduce(
    (acc, m) => Math.max(acc, m.round_number ?? 0),
    0
  );
  const nextRound =
    typeof input.roundNumber === 'number'
      ? input.roundNumber
      : maxExistingRound + 1;
  if (nextRound <= maxExistingRound) {
    return {
      ok: false,
      status: 409,
      code: 'ROUND_TOO_SMALL',
      error: `Le round ${nextRound} existe deja (ou un round plus grand existe). Le prochain round attendu est ${maxExistingRound + 1}.`,
    };
  }

  const totalRounds = settings.total_rounds;
  if (typeof totalRounds === 'number' && totalRounds > 0 && nextRound > totalRounds) {
    return {
      ok: false,
      status: 400,
      code: 'ROUND_BEYOND_TOTAL',
      error: `Le maximum est ${totalRounds} rounds — augmentez total_rounds dans les settings.`,
    };
  }

  if (maxExistingRound > 0) {
    const unfinished = allMatches.filter(
      (m) => m.round_number === maxExistingRound && m.status !== 'finished'
    );
    if (unfinished.length > 0) {
      return {
        ok: false,
        status: 400,
        code: 'UNFINISHED_PREVIOUS_ROUND',
        error: `${unfinished.length} match(s) du round ${maxExistingRound} non termines.`,
      };
    }
  }

  // 4) Swiss results
  const scoreConfig: SwissScoreConfig = {
    ...defaultSwissScoreConfig,
    ...(input.scoreConfig ?? {}),
  };
  const pastFinished = allMatches.filter(
    (m) =>
      (m.round_number ?? 0) > 0 &&
      (m.round_number ?? 0) < nextRound &&
      m.status === 'finished'
  );
  const swissResults = buildSwissResultsFromMatches(pastFinished, scoreConfig);

  const standingParticipants: SwissStandingParticipant[] = participants.map(
    (p, idx) => ({
      id: p.team_id,
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
  for (const m of allMatches) {
    if (m.is_bye && m.team1_id && m.status === 'finished') hadByeSet.add(m.team1_id);
  }

  // 5) Pairings
  const pairingParticipants: PairingParticipant[] = participants.map(
    (p, idx) => ({
      id: p.team_id,
      seed: typeof p.seed === 'number' ? p.seed : idx + 1,
      score: scoreByTeam.get(p.team_id) ?? 0,
      hadBye: hadByeSet.has(p.team_id),
    })
  );

  const { pairings, hasRematches } = generateSwissPairings({
    participants: pairingParticipants,
    pastMatches: resultsToPastMatches(swissResults),
    allowRematchesFallback: input.allowRematchesFallback ?? true,
  });

  if (pairings.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'EMPTY_PAIRING',
      error: 'Aucun pairing genere (pas assez de participants ?).',
    };
  }

  // 6) Preview (used for dryRun + 409 REMATCHES_PRESENT)
  const teamIds = participants.map((p) => p.team_id);
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .in('id', teamIds);
  const nameById = new Map<string, string | null>();
  for (const t of teams ?? []) {
    nameById.set((t as any).id, (t as any).name ?? null);
  }
  const preview: PreviewPairing[] = pairings.map((p) => ({
    team1Id: p.player1Id,
    team1Name: nameById.get(p.player1Id) ?? null,
    team2Id: p.player2Id ?? null,
    team2Name: p.player2Id ? nameById.get(p.player2Id) ?? null : null,
    isBye: p.isBye,
  }));

  // 7) Garde rematches : en mode insert, refuse sans acceptRematches.
  if (
    hasRematches &&
    !input.dryRun &&
    input.acceptRematches !== true
  ) {
    return {
      ok: false,
      status: 409,
      code: 'REMATCHES_PRESENT',
      error:
        'Le pairing genere contient des rematches. Renvoie acceptRematches=true pour confirmer.',
      preview,
      hasRematches,
      roundNumber: nextRound,
    };
  }

  // 8) Dry run
  if (input.dryRun) {
    return {
      ok: true,
      mode: 'dry-run',
      stageId: stage.id,
      tournamentId: stage.tournament_id,
      roundNumber: nextRound,
      hasRematches,
      preview,
      createdMatchIds: [],
    };
  }

  // 9) Insert
  const nowIso = new Date().toISOString();
  const matchInserts = pairings.map((p) => {
    if (p.isBye) {
      return {
        tenant_id: input.tenantId,
        tournament_id: stage.tournament_id,
        stage_id: stage.id,
        status: 'finished' as MatchStatus,
        is_bye: true,
        match_format: settings.match_format ?? 'bo3',
        round_name: `Round ${nextRound}`,
        round_number: nextRound,
        bracket_side: 'none',
        team1_id: p.player1Id,
        team2_id: null,
        team1_score: scoreConfig.bye ?? 1,
        team2_score: 0,
        winner_team_id: p.player1Id,
        completed_at: nowIso,
      };
    }
    return {
      tenant_id: input.tenantId,
      tournament_id: stage.tournament_id,
      stage_id: stage.id,
      status: 'pending' as MatchStatus,
      is_bye: false,
      match_format: settings.match_format ?? 'bo3',
      round_name: `Round ${nextRound}`,
      round_number: nextRound,
      bracket_side: 'none',
      team1_id: p.player1Id,
      team2_id: p.player2Id,
    };
  });

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('matches')
    .insert(matchInserts)
    .select('id');
  if (insErr) {
    return {
      ok: false,
      status: 500,
      code: 'DB_ERROR',
      error: insErr.message,
    };
  }

  return {
    ok: true,
    mode: 'inserted',
    stageId: stage.id,
    tournamentId: stage.tournament_id,
    roundNumber: nextRound,
    hasRematches,
    preview,
    createdMatchIds: (inserted ?? []).map((r) => (r as { id: string }).id),
  };
}
