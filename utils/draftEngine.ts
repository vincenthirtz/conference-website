// utils/draftEngine.ts
// MOBA draft engine for LoL / Dota 2 (Lot 2 — engine API).
//
// Responsibilities :
//   - init a fresh draft for a given (match, gameIndex), seeding match_draft_steps
//     from the per-game DraftFlow declared in config/games/{lol,dota2}.ts.
//   - assemble the public DraftState (draft + flow + steps + bans/picks resolved
//     to GameHero rows) for the spectator / captain UIs.
//   - validate + commit a single ban/pick step (atomic-ish over a single tenant).
//   - assign the team1/team2 sides (blue|red for LoL, radiant|dire for Dota).
//
// Out of scope here (later lots) :
//   - server-side 30s pick timer + auto-pick (Lot 3 — Realtime).
//   - captain-aware HTTP auth (Lot 4 — UI captain). For now everything goes
//     through the staff-only API.

import type {
  DraftFlow,
  DraftGameSide,
  DraftState,
  GameHero,
  MatchDraft,
  MatchDraftStep,
} from '@/types/draft';
import { getGame, type GameSlug, type MatchFormat } from '@/config/games';
import { supabaseAdmin } from '@/utils/supabase';

type DraftGameSlug = 'lol' | 'dota2';

/** Valid side values per game — single source of truth. */
const SIDES_BY_GAME: Record<DraftGameSlug, readonly DraftGameSide[]> = {
  lol: ['blue', 'red'],
  dota2: ['radiant', 'dire'],
};

export function isDraftGameSlug(value: unknown): value is DraftGameSlug {
  return value === 'lol' || value === 'dota2';
}

export function allowedSidesForGame(
  game: DraftGameSlug
): readonly DraftGameSide[] {
  return SIDES_BY_GAME[game];
}

/** Structured error returned by every public function — handlers map to HTTP. */
export class DraftEngineError extends Error {
  constructor(
    public readonly code: DraftEngineErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DraftEngineError';
  }
}

export type DraftEngineErrorCode =
  | 'MATCH_NOT_FOUND'
  | 'TOURNAMENT_NOT_FOUND'
  | 'GAME_NOT_DRAFTABLE'
  | 'FORMAT_NOT_SUPPORTED'
  | 'GAME_INDEX_OUT_OF_RANGE'
  | 'DRAFT_ALREADY_EXISTS'
  | 'DRAFT_NOT_FOUND'
  | 'SIDES_INVALID'
  | 'SIDES_REQUIRED'
  | 'DRAFT_NOT_IN_PROGRESS'
  | 'DRAFT_NOT_PENDING'
  | 'STEP_OUT_OF_ORDER'
  | 'HERO_NOT_FOUND'
  | 'HERO_WRONG_GAME'
  | 'HERO_ALREADY_BANNED'
  | 'HERO_ALREADY_PICKED'
  | 'HERO_FEARLESS_BLOCKED'
  | 'PICK_TIMER_INVALID'
  | 'NO_ELIGIBLE_HERO'
  | 'DEADLINE_NOT_REACHED'
  | 'STEP_ALREADY_COMMITTED'
  | 'DB_ERROR';

function db() {
  if (!supabaseAdmin) {
    throw new DraftEngineError(
      'DB_ERROR',
      'Database service unavailable.',
      500
    );
  }
  return supabaseAdmin;
}

// ---------------------------------------------------------------------------
// Format → gameIndex range. A bo1 has 1 game, bo3 up to 3, bo5 up to 5.

const MAX_GAMES_PER_FORMAT: Record<MatchFormat, number> = {
  bo1: 1,
  bo3: 3,
  bo5: 5,
  bo7: 7,
};

export function maxGamesForFormat(format: MatchFormat): number {
  return MAX_GAMES_PER_FORMAT[format];
}

// ---------------------------------------------------------------------------
// Match + game resolution.

type MatchContext = {
  matchId: string;
  tenantId: string;
  game: DraftGameSlug;
  format: MatchFormat;
  flow: DraftFlow;
};

async function loadMatchContext(
  matchId: string,
  tenantId: string,
  gameIndex: number
): Promise<MatchContext> {
  const client = db();
  const { data: match, error: matchErr } = await client
    .from('matches')
    .select('id, tenant_id, tournament_id, match_format')
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (matchErr) {
    throw new DraftEngineError('DB_ERROR', matchErr.message, 500);
  }
  if (!match) {
    throw new DraftEngineError('MATCH_NOT_FOUND', 'Match not found.', 404);
  }

  if (!match.tournament_id) {
    throw new DraftEngineError(
      'TOURNAMENT_NOT_FOUND',
      'Match has no tournament — cannot resolve game.',
      404
    );
  }

  const { data: tournament, error: tourErr } = await client
    .from('tournaments')
    .select('id, game')
    .eq('id', match.tournament_id)
    .maybeSingle();

  if (tourErr) {
    throw new DraftEngineError('DB_ERROR', tourErr.message, 500);
  }
  if (!tournament || !tournament.game) {
    throw new DraftEngineError(
      'GAME_NOT_DRAFTABLE',
      'Tournament has no game tagged — cannot init draft.',
      400
    );
  }
  if (!isDraftGameSlug(tournament.game)) {
    throw new DraftEngineError(
      'GAME_NOT_DRAFTABLE',
      `Game "${tournament.game}" has no draft phase.`,
      400
    );
  }

  const format = (match.match_format ?? 'bo1') as MatchFormat;
  const max = maxGamesForFormat(format);
  if (gameIndex < 1 || gameIndex > max) {
    throw new DraftEngineError(
      'GAME_INDEX_OUT_OF_RANGE',
      `gameIndex ${gameIndex} out of range for ${format} (1..${max}).`,
      400,
      { format, gameIndex, max }
    );
  }

  const gameDef = getGame(tournament.game as GameSlug);
  const flow = gameDef?.draftFlows?.[format];
  if (!flow) {
    throw new DraftEngineError(
      'FORMAT_NOT_SUPPORTED',
      `Game "${tournament.game}" has no draft flow for format "${format}".`,
      400
    );
  }

  return {
    matchId: match.id,
    tenantId: match.tenant_id,
    game: tournament.game as DraftGameSlug,
    format,
    flow,
  };
}

// ---------------------------------------------------------------------------
// State assembly.

type LoadedDraft = {
  draft: MatchDraft;
  steps: MatchDraftStep[];
  heroesById: Map<string, GameHero>;
  flow: DraftFlow;
};

async function loadDraftRowByGameIndex(
  matchId: string,
  gameIndex: number,
  tenantId: string
): Promise<MatchDraft | null> {
  const client = db();
  const { data, error } = await client
    .from('match_drafts')
    .select(
      'id, match_id, game_index, game, team1_side, team2_side, current_step, status, fearless, pick_timer_seconds, started_at, completed_at, tenant_id, created_at, updated_at'
    )
    .eq('match_id', matchId)
    .eq('game_index', gameIndex)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    throw new DraftEngineError('DB_ERROR', error.message, 500);
  }
  return (data as MatchDraft | null) ?? null;
}

async function loadDraftRowById(
  draftId: string,
  tenantId: string
): Promise<MatchDraft> {
  const client = db();
  const { data, error } = await client
    .from('match_drafts')
    .select(
      'id, match_id, game_index, game, team1_side, team2_side, current_step, status, fearless, pick_timer_seconds, started_at, completed_at, tenant_id, created_at, updated_at'
    )
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    throw new DraftEngineError('DB_ERROR', error.message, 500);
  }
  if (!data) {
    throw new DraftEngineError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
  }
  return data as MatchDraft;
}

async function loadFullDraft(
  draftId: string,
  tenantId: string,
  flow: DraftFlow
): Promise<LoadedDraft> {
  const client = db();
  const draft = await loadDraftRowById(draftId, tenantId);
  const { data: stepsRows, error: stepsErr } = await client
    .from('match_draft_steps')
    .select(
      'id, draft_id, step_number, phase, action, side, hero_id, committed_at, deadline_at, auto_picked, created_at'
    )
    .eq('draft_id', draftId)
    .order('step_number', { ascending: true });
  if (stepsErr) {
    throw new DraftEngineError('DB_ERROR', stepsErr.message, 500);
  }
  const steps = (stepsRows ?? []) as MatchDraftStep[];

  const heroIds = steps.map((s) => s.hero_id).filter((id): id is string => !!id);
  let heroesById = new Map<string, GameHero>();
  if (heroIds.length > 0) {
    const { data: heroRows, error: heroErr } = await client
      .from('game_heroes')
      .select(
        'id, game, external_id, key, name, title, roles, attribute, image_url, icon_url, data, enabled, fetched_at, created_at, updated_at'
      )
      .in('id', heroIds);
    if (heroErr) {
      throw new DraftEngineError('DB_ERROR', heroErr.message, 500);
    }
    for (const h of (heroRows ?? []) as GameHero[]) heroesById.set(h.id, h);
  }

  return { draft, steps, heroesById, flow };
}

function assembleState(loaded: LoadedDraft): DraftState {
  const { draft, steps, heroesById, flow } = loaded;
  const bannedHeroes: GameHero[] = [];
  const team1Picks: GameHero[] = [];
  const team2Picks: GameHero[] = [];
  for (const step of steps) {
    if (!step.hero_id) continue;
    const hero = heroesById.get(step.hero_id);
    if (!hero) continue;
    if (step.action === 'ban') {
      bannedHeroes.push(hero);
    } else if (step.side === 'team1') {
      team1Picks.push(hero);
    } else {
      team2Picks.push(hero);
    }
  }

  // nextStepIndex : first step in `flow.steps` without a hero_id, -1 if none left.
  const nextStepIndex = flow.steps.findIndex((flowStep) => {
    const row = steps.find((s) => s.step_number === flowStep.step_number);
    return !row || row.hero_id === null;
  });

  return {
    draft,
    flow,
    steps,
    nextStepIndex,
    bannedHeroes,
    team1Picks,
    team2Picks,
  };
}

// ---------------------------------------------------------------------------
// Public API.

export type InitDraftInput = {
  matchId: string;
  gameIndex: number;
  tenantId: string;
  fearless?: boolean;
  pickTimerSeconds?: number;
};

export async function initDraft(input: InitDraftInput): Promise<DraftState> {
  const client = db();
  const ctx = await loadMatchContext(input.matchId, input.tenantId, input.gameIndex);

  const existing = await loadDraftRowByGameIndex(
    ctx.matchId,
    input.gameIndex,
    ctx.tenantId
  );
  if (existing) {
    throw new DraftEngineError(
      'DRAFT_ALREADY_EXISTS',
      `Draft already exists for match ${ctx.matchId} game ${input.gameIndex}.`,
      409,
      { draftId: existing.id }
    );
  }

  const pickTimer = input.pickTimerSeconds ?? 30;
  if (!Number.isInteger(pickTimer) || pickTimer < 5 || pickTimer > 300) {
    throw new DraftEngineError(
      'PICK_TIMER_INVALID',
      'pickTimerSeconds must be an integer in [5, 300].',
      400
    );
  }

  const fearless = input.fearless ?? ctx.flow.fearless;

  const { data: inserted, error: insertErr } = await client
    .from('match_drafts')
    .insert({
      match_id: ctx.matchId,
      game_index: input.gameIndex,
      game: ctx.game,
      current_step: 0,
      status: 'pending',
      fearless,
      pick_timer_seconds: pickTimer,
      tenant_id: ctx.tenantId,
    })
    .select(
      'id, match_id, game_index, game, team1_side, team2_side, current_step, status, fearless, pick_timer_seconds, started_at, completed_at, tenant_id, created_at, updated_at'
    )
    .single();

  if (insertErr || !inserted) {
    throw new DraftEngineError(
      'DB_ERROR',
      insertErr?.message ?? 'Failed to insert match_drafts row.',
      500
    );
  }

  const draftId = (inserted as MatchDraft).id;

  const stepRows = ctx.flow.steps.map((s) => ({
    draft_id: draftId,
    step_number: s.step_number,
    phase: s.phase,
    action: s.action,
    side: s.side,
    hero_id: null,
  }));

  const { error: stepInsertErr } = await client
    .from('match_draft_steps')
    .insert(stepRows);
  if (stepInsertErr) {
    throw new DraftEngineError('DB_ERROR', stepInsertErr.message, 500);
  }

  const loaded = await loadFullDraft(draftId, ctx.tenantId, ctx.flow);
  return assembleState(loaded);
}

export type DeleteDraftInput = {
  matchId: string;
  gameIndex: number;
  tenantId: string;
  /**
   * When false (default), the engine refuses to delete a draft whose
   * status is `in_progress` — staff must cancel it explicitly or wait
   * for completion. `force=true` bypasses that guard.
   */
  force?: boolean;
};

export type DeleteDraftResult = {
  deletedDraftId: string;
  deletedSteps: number;
};

/**
 * Drop a draft and its steps. Used to recover from a bad init
 * (wrong game_index, wrong fearless flag, etc.) without dropping
 * into SQL. Match-level rows are kept untouched.
 */
export async function deleteDraft(
  input: DeleteDraftInput
): Promise<DeleteDraftResult> {
  const client = db();
  // Resolve match → tenant scope (uses the same lookup as init/get so
  // bad matchIds still produce a clean 404).
  await loadMatchContext(input.matchId, input.tenantId, input.gameIndex);

  const existing = await loadDraftRowByGameIndex(
    input.matchId,
    input.gameIndex,
    input.tenantId
  );
  if (!existing) {
    throw new DraftEngineError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
  }
  if (existing.status === 'in_progress' && !input.force) {
    throw new DraftEngineError(
      'DRAFT_NOT_PENDING',
      'Refusing to delete an in_progress draft. Pass force=true to override.',
      409
    );
  }

  // Steps first so we can report a count, then the parent. The schema
  // also has ON DELETE CASCADE on match_draft_steps.draft_id → either
  // path leaves the table clean.
  const { data: deletedSteps, error: stepsErr } = await client
    .from('match_draft_steps')
    .delete()
    .eq('draft_id', existing.id)
    .select('id');
  if (stepsErr) {
    throw new DraftEngineError('DB_ERROR', stepsErr.message, 500);
  }

  const { error: draftErr } = await client
    .from('match_drafts')
    .delete()
    .eq('id', existing.id)
    .eq('tenant_id', input.tenantId);
  if (draftErr) {
    throw new DraftEngineError('DB_ERROR', draftErr.message, 500);
  }

  return {
    deletedDraftId: existing.id,
    deletedSteps: (deletedSteps ?? []).length,
  };
}

export type GetDraftStateInput = {
  matchId: string;
  gameIndex: number;
  tenantId: string;
};

export async function getDraftState(
  input: GetDraftStateInput
): Promise<DraftState | null> {
  const ctx = await loadMatchContext(input.matchId, input.tenantId, input.gameIndex);
  const existing = await loadDraftRowByGameIndex(
    ctx.matchId,
    input.gameIndex,
    ctx.tenantId
  );
  if (!existing) return null;
  const loaded = await loadFullDraft(existing.id, ctx.tenantId, ctx.flow);
  return assembleState(loaded);
}

export type SetDraftSidesInput = {
  matchId: string;
  gameIndex: number;
  tenantId: string;
  team1Side: string;
  team2Side: string;
};

export async function setDraftSides(
  input: SetDraftSidesInput
): Promise<DraftState> {
  const client = db();
  const ctx = await loadMatchContext(input.matchId, input.tenantId, input.gameIndex);
  const existing = await loadDraftRowByGameIndex(
    ctx.matchId,
    input.gameIndex,
    ctx.tenantId
  );
  if (!existing) {
    throw new DraftEngineError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
  }

  const allowed = SIDES_BY_GAME[ctx.game] as readonly string[];
  if (!allowed.includes(input.team1Side) || !allowed.includes(input.team2Side)) {
    throw new DraftEngineError(
      'SIDES_INVALID',
      `Sides must be one of ${allowed.join('|')} for game "${ctx.game}".`,
      400,
      { allowed }
    );
  }
  if (input.team1Side === input.team2Side) {
    throw new DraftEngineError(
      'SIDES_INVALID',
      'team1Side and team2Side must differ.',
      400
    );
  }

  // Allow side selection only while no step has been committed yet.
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new DraftEngineError(
      'DRAFT_NOT_IN_PROGRESS',
      `Cannot change sides on a ${existing.status} draft.`,
      409
    );
  }
  if (existing.current_step > 0) {
    throw new DraftEngineError(
      'DRAFT_NOT_IN_PROGRESS',
      'Cannot change sides after the draft has started.',
      409
    );
  }

  const { error: updErr } = await client
    .from('match_drafts')
    .update({
      team1_side: input.team1Side,
      team2_side: input.team2Side,
    })
    .eq('id', existing.id)
    .eq('tenant_id', ctx.tenantId);
  if (updErr) {
    throw new DraftEngineError('DB_ERROR', updErr.message, 500);
  }

  const loaded = await loadFullDraft(existing.id, ctx.tenantId, ctx.flow);
  return assembleState(loaded);
}

// ---------------------------------------------------------------------------
// Deadline helpers — Lot 3 (server-side timer).

function computeDeadlineIso(pickTimerSeconds: number, nowMs: number): string {
  return new Date(nowMs + pickTimerSeconds * 1000).toISOString();
}

async function stampDeadlineOnStep(
  draftId: string,
  stepNumber: number,
  deadlineIso: string
): Promise<void> {
  const client = db();
  const { error } = await client
    .from('match_draft_steps')
    .update({ deadline_at: deadlineIso })
    .eq('draft_id', draftId)
    .eq('step_number', stepNumber);
  if (error) {
    throw new DraftEngineError('DB_ERROR', error.message, 500);
  }
}

export type StartDraftInput = {
  matchId: string;
  gameIndex: number;
  tenantId: string;
  /** Defaults to Date.now() ; injected by tests + the cron. */
  now?: number;
};

/**
 * Explicit transition pending → in_progress for a draft whose sides are
 * already set. Stamps `started_at`, sets `deadline_at` on step 1.
 * Idempotent on already-started drafts only when the caller hasn't already
 * committed a step (returns the same state).
 */
export async function startDraft(input: StartDraftInput): Promise<DraftState> {
  const client = db();
  const ctx = await loadMatchContext(input.matchId, input.tenantId, input.gameIndex);
  const existing = await loadDraftRowByGameIndex(
    ctx.matchId,
    input.gameIndex,
    ctx.tenantId
  );
  if (!existing) {
    throw new DraftEngineError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
  }
  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new DraftEngineError(
      'DRAFT_NOT_PENDING',
      `Cannot start a ${existing.status} draft.`,
      409
    );
  }
  if (existing.current_step > 0) {
    throw new DraftEngineError(
      'DRAFT_NOT_PENDING',
      'Draft has already started.',
      409
    );
  }
  if (!existing.team1_side || !existing.team2_side) {
    throw new DraftEngineError(
      'SIDES_REQUIRED',
      'Set team1Side + team2Side before starting the draft.',
      409
    );
  }

  const nowMs = input.now ?? Date.now();
  const startedAt = new Date(nowMs).toISOString();
  const deadlineAt = computeDeadlineIso(existing.pick_timer_seconds, nowMs);

  const { error: updErr } = await client
    .from('match_drafts')
    .update({ status: 'in_progress', started_at: startedAt })
    .eq('id', existing.id)
    .eq('tenant_id', ctx.tenantId);
  if (updErr) {
    throw new DraftEngineError('DB_ERROR', updErr.message, 500);
  }

  await stampDeadlineOnStep(existing.id, 1, deadlineAt);

  const loaded = await loadFullDraft(existing.id, ctx.tenantId, ctx.flow);
  return assembleState(loaded);
}

export type CommitDraftStepInput = {
  matchId: string;
  gameIndex: number;
  tenantId: string;
  stepNumber: number;
  heroId: string;
  /** Marks the row `auto_picked=true` (used by the timer cron). */
  autoPicked?: boolean;
  /** Defaults to Date.now() ; injected by tests + the cron. */
  now?: number;
};

export async function commitDraftStep(
  input: CommitDraftStepInput
): Promise<DraftState> {
  const client = db();
  const ctx = await loadMatchContext(input.matchId, input.tenantId, input.gameIndex);
  const existing = await loadDraftRowByGameIndex(
    ctx.matchId,
    input.gameIndex,
    ctx.tenantId
  );
  if (!existing) {
    throw new DraftEngineError('DRAFT_NOT_FOUND', 'Draft not found.', 404);
  }

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw new DraftEngineError(
      'DRAFT_NOT_IN_PROGRESS',
      `Draft is ${existing.status}.`,
      409
    );
  }

  // Sides must be assigned before the first commit so the UI can render the
  // correct sides (Blue/Red, Radiant/Dire) for step 1. The DB CHECK ensures
  // any non-null value is a valid side, so a falsy check covers null + (in
  // the in-memory mock) undefined.
  if (
    existing.current_step === 0 &&
    (!existing.team1_side || !existing.team2_side)
  ) {
    throw new DraftEngineError(
      'SIDES_REQUIRED',
      'Set team1Side + team2Side before committing the first step.',
      409
    );
  }

  const expected = existing.current_step + 1;
  if (input.stepNumber !== expected) {
    throw new DraftEngineError(
      'STEP_OUT_OF_ORDER',
      `Expected stepNumber=${expected}, got ${input.stepNumber}.`,
      409,
      { expected, got: input.stepNumber }
    );
  }

  const flowStep = ctx.flow.steps.find((s) => s.step_number === expected);
  if (!flowStep) {
    throw new DraftEngineError(
      'STEP_OUT_OF_ORDER',
      `No flow step #${expected} defined.`,
      400
    );
  }

  const { data: heroRow, error: heroErr } = await client
    .from('game_heroes')
    .select('id, game, enabled, name, key')
    .eq('id', input.heroId)
    .maybeSingle();
  if (heroErr) {
    throw new DraftEngineError('DB_ERROR', heroErr.message, 500);
  }
  if (!heroRow) {
    throw new DraftEngineError('HERO_NOT_FOUND', 'Hero not found.', 404);
  }
  if ((heroRow as any).game !== ctx.game) {
    throw new DraftEngineError(
      'HERO_WRONG_GAME',
      `Hero belongs to "${(heroRow as any).game}", not "${ctx.game}".`,
      400
    );
  }

  const { data: existingSteps, error: stepsErr } = await client
    .from('match_draft_steps')
    .select('id, step_number, action, side, hero_id, committed_at')
    .eq('draft_id', existing.id)
    .order('step_number', { ascending: true });
  if (stepsErr) {
    throw new DraftEngineError('DB_ERROR', stepsErr.message, 500);
  }
  const steps = (existingSteps ?? []) as MatchDraftStep[];

  // Crash-window handling : if the target step already has hero_id set
  // (e.g. UPDATE step succeeded then the draft UPDATE crashed), accept the
  // retry only when the heroId matches — that's a true idempotent replay
  // and we re-run the draft UPDATE to heal current_step. A mismatch means
  // the operator is trying to commit a different hero on a step that's
  // already locked in : surface it explicitly instead of silently
  // overwriting the committed pick.
  const targetStepRow = steps.find((s) => s.step_number === expected);
  const idempotentReplay =
    !!targetStepRow?.hero_id && targetStepRow.hero_id === input.heroId;
  if (targetStepRow?.hero_id && !idempotentReplay) {
    throw new DraftEngineError(
      'STEP_ALREADY_COMMITTED',
      `Step ${expected} already committed with a different hero.`,
      409
    );
  }

  for (const step of steps) {
    // Skip the current step in the dedup loop : either it's empty (normal
    // path) or it carries the same heroId as the retry (idempotent replay
    // path). The mismatch case was handled above.
    if (step.step_number === expected) continue;
    if (step.hero_id !== input.heroId) continue;
    if (step.action === 'ban') {
      throw new DraftEngineError(
        'HERO_ALREADY_BANNED',
        `Hero already banned at step ${step.step_number}.`,
        409
      );
    }
    throw new DraftEngineError(
      'HERO_ALREADY_PICKED',
      `Hero already picked at step ${step.step_number}.`,
      409
    );
  }

  // Fearless: also reject if the hero was picked in any previous game of the
  // same match (game_index < current).
  if (existing.fearless && input.gameIndex > 1) {
    const { data: priorDrafts, error: priorErr } = await client
      .from('match_drafts')
      .select('id')
      .eq('match_id', ctx.matchId)
      .eq('tenant_id', ctx.tenantId)
      .lt('game_index', input.gameIndex);
    if (priorErr) {
      throw new DraftEngineError('DB_ERROR', priorErr.message, 500);
    }
    const priorIds = (priorDrafts ?? []).map((d: any) => d.id as string);
    if (priorIds.length > 0) {
      const { data: priorSteps, error: priorStepErr } = await client
        .from('match_draft_steps')
        .select('hero_id, action, step_number')
        .in('draft_id', priorIds)
        .eq('action', 'pick');
      if (priorStepErr) {
        throw new DraftEngineError('DB_ERROR', priorStepErr.message, 500);
      }
      const pickedBefore = new Set(
        (priorSteps ?? [])
          .map((s: any) => s.hero_id as string | null)
          .filter((id): id is string => !!id)
      );
      if (pickedBefore.has(input.heroId)) {
        throw new DraftEngineError(
          'HERO_FEARLESS_BLOCKED',
          'Hero was picked in a previous game of this fearless series.',
          409
        );
      }
    }
  }

  const targetStep = steps.find((s) => s.step_number === expected);
  if (!targetStep) {
    throw new DraftEngineError(
      'STEP_OUT_OF_ORDER',
      `Step row #${expected} not seeded for this draft.`,
      500
    );
  }

  const nowMs = input.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const { error: updateStepErr } = await client
    .from('match_draft_steps')
    .update({
      hero_id: input.heroId,
      committed_at: nowIso,
      auto_picked: input.autoPicked ?? false,
    })
    .eq('id', targetStep.id);
  if (updateStepErr) {
    throw new DraftEngineError('DB_ERROR', updateStepErr.message, 500);
  }

  const isLastStep = expected >= ctx.flow.steps.length;
  const patch: Record<string, unknown> = { current_step: expected };
  if (existing.current_step === 0) {
    patch.status = 'in_progress';
    patch.started_at = nowIso;
  }
  if (isLastStep) {
    patch.status = 'completed';
    patch.completed_at = nowIso;
  }
  const { error: draftUpdErr } = await client
    .from('match_drafts')
    .update(patch)
    .eq('id', existing.id)
    .eq('tenant_id', ctx.tenantId);
  if (draftUpdErr) {
    throw new DraftEngineError('DB_ERROR', draftUpdErr.message, 500);
  }

  // Lot 3 : stamp the deadline on the next step so the cron / UI can race
  // against it. Skipped on the last step (nothing left to play).
  if (!isLastStep) {
    const nextStepNumber = expected + 1;
    const deadlineIso = computeDeadlineIso(existing.pick_timer_seconds, nowMs);
    await stampDeadlineOnStep(existing.id, nextStepNumber, deadlineIso);
  }

  const loaded = await loadFullDraft(existing.id, ctx.tenantId, ctx.flow);
  return assembleState(loaded);
}

// ---------------------------------------------------------------------------
// Auto-pick — Lot 3 (server-side timer enforcement).

export type AutoPickInput = {
  draftId: string;
  tenantId: string;
  /** Defaults to Date.now() ; injected by tests + the cron. */
  now?: number;
};

export type AutoPickResult = {
  draftId: string;
  matchId: string;
  gameIndex: number;
  stepNumber: number;
  heroId: string;
  state: DraftState;
};

/**
 * If the current step of `draftId` is past its `deadline_at`, picks a
 * deterministic eligible hero (first by alphabetical name) and commits
 * it with `auto_picked = true`. Returns null when nothing to do (draft
 * not in progress, step already committed, deadline in the future).
 */
export async function applyAutoPickIfExpired(
  input: AutoPickInput
): Promise<AutoPickResult | null> {
  const client = db();
  const draft = await loadDraftRowById(input.draftId, input.tenantId);
  if (draft.status !== 'in_progress') return null;

  // Resolve the match context so we get the flow + tenant-scoped check.
  const ctx = await loadMatchContext(draft.match_id, input.tenantId, draft.game_index);

  // Current step = current_step + 1 (1-based).
  const expected = draft.current_step + 1;
  if (expected > ctx.flow.steps.length) return null;

  const { data: stepRow, error: stepErr } = await client
    .from('match_draft_steps')
    .select('id, step_number, action, side, hero_id, deadline_at')
    .eq('draft_id', draft.id)
    .eq('step_number', expected)
    .maybeSingle();
  if (stepErr) {
    throw new DraftEngineError('DB_ERROR', stepErr.message, 500);
  }
  if (!stepRow || (stepRow as any).hero_id) return null;

  const deadlineIso = (stepRow as any).deadline_at as string | null;
  if (!deadlineIso) return null;
  const nowMs = input.now ?? Date.now();
  if (Date.parse(deadlineIso) > nowMs) return null;

  // Build the eligible-hero list : same game, enabled, not already
  // banned/picked in this draft, and (if fearless && gameIndex > 1) not
  // picked in any prior game of this match.
  const { data: poolRows, error: poolErr } = await client
    .from('game_heroes')
    .select('id, name')
    .eq('game', draft.game)
    .eq('enabled', true);
  if (poolErr) {
    throw new DraftEngineError('DB_ERROR', poolErr.message, 500);
  }

  const { data: usedSteps, error: usedErr } = await client
    .from('match_draft_steps')
    .select('hero_id')
    .eq('draft_id', draft.id);
  if (usedErr) {
    throw new DraftEngineError('DB_ERROR', usedErr.message, 500);
  }
  const usedIds = new Set(
    (usedSteps ?? [])
      .map((s: any) => s.hero_id as string | null)
      .filter((id): id is string => !!id)
  );

  if (draft.fearless && draft.game_index > 1) {
    const { data: priorDrafts, error: priorErr } = await client
      .from('match_drafts')
      .select('id')
      .eq('match_id', draft.match_id)
      .eq('tenant_id', input.tenantId)
      .lt('game_index', draft.game_index);
    if (priorErr) {
      throw new DraftEngineError('DB_ERROR', priorErr.message, 500);
    }
    const priorIds = (priorDrafts ?? []).map((d: any) => d.id as string);
    if (priorIds.length > 0) {
      const { data: priorPicks, error: priorPicksErr } = await client
        .from('match_draft_steps')
        .select('hero_id, action')
        .in('draft_id', priorIds)
        .eq('action', 'pick');
      if (priorPicksErr) {
        throw new DraftEngineError('DB_ERROR', priorPicksErr.message, 500);
      }
      for (const s of (priorPicks ?? []) as any[]) {
        if (s.hero_id) usedIds.add(s.hero_id);
      }
    }
  }

  const eligible = ((poolRows ?? []) as { id: string; name: string }[]).filter(
    (h) => !usedIds.has(h.id)
  );
  if (eligible.length === 0) {
    throw new DraftEngineError(
      'NO_ELIGIBLE_HERO',
      'No eligible hero left for auto-pick.',
      500
    );
  }
  eligible.sort((a, b) => a.name.localeCompare(b.name));
  const chosen = eligible[0];

  const state = await commitDraftStep({
    matchId: draft.match_id,
    gameIndex: draft.game_index,
    tenantId: input.tenantId,
    stepNumber: expected,
    heroId: chosen.id,
    autoPicked: true,
    now: nowMs,
  });

  return {
    draftId: draft.id,
    matchId: draft.match_id,
    gameIndex: draft.game_index,
    stepNumber: expected,
    heroId: chosen.id,
    state,
  };
}

export type RunAutoPickTickInput = {
  /** Defaults to Date.now() ; injected by tests. */
  now?: number;
  /** Cap so a single tick can't blow the function-seconds budget. */
  limit?: number;
};

export type RunAutoPickTickSummary = {
  scanned: number;
  autoPicked: number;
  errors: number;
  results: AutoPickResult[];
};

/**
 * Cross-tenant scan : every `in_progress` draft whose current step has a
 * `deadline_at` in the past gets auto-picked. Errors on individual drafts
 * are caught and counted so one bad draft doesn't block the rest of the
 * tick.
 */
export async function runDraftAutoPickTick(
  input: RunAutoPickTickInput = {}
): Promise<RunAutoPickTickSummary> {
  const client = db();
  const nowMs = input.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));

  const { data: rows, error } = await client
    .from('match_draft_steps')
    .select('draft_id, deadline_at')
    .lt('deadline_at', nowIso)
    .is('hero_id', null)
    .limit(limit);
  if (error) {
    throw new DraftEngineError('DB_ERROR', error.message, 500);
  }

  // De-dupe : a draft's current step is unique, but a stale `deadline_at`
  // on an earlier step (cleared after commit on real DB but possible on
  // the in-memory mock) shouldn't trigger the same draft twice.
  const draftIds = Array.from(
    new Set(((rows ?? []) as any[]).map((r) => r.draft_id as string))
  );

  // Fetch each draft's tenant_id so we can scope the engine calls.
  const summary: RunAutoPickTickSummary = {
    scanned: draftIds.length,
    autoPicked: 0,
    errors: 0,
    results: [],
  };
  if (draftIds.length === 0) return summary;

  const { data: drafts, error: dErr } = await client
    .from('match_drafts')
    .select('id, tenant_id')
    .in('id', draftIds)
    .eq('status', 'in_progress');
  if (dErr) {
    throw new DraftEngineError('DB_ERROR', dErr.message, 500);
  }
  for (const d of ((drafts ?? []) as any[])) {
    try {
      const result = await applyAutoPickIfExpired({
        draftId: d.id,
        tenantId: d.tenant_id,
        now: nowMs,
      });
      if (result) {
        summary.autoPicked += 1;
        summary.results.push(result);
      }
    } catch {
      summary.errors += 1;
    }
  }
  return summary;
}
