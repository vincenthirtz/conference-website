// features/admin/tournaments/service/matches.ts — matchs d'un tournoi côté
// staff : liste filtrée, création en lot, bracket (génération, sauvegarde,
// validation). Opérations en masse : bulk.ts.
//
// La génération de bracket reste dans le moteur partagé
// (utils/bracket/generateBracket.ts) : ce service ne fait que l'appeler.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import {
  isValidUUID,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { firstString } from '@/utils/admin/pathParams';
import type { MatchForGraph } from '@/types/bracket';
import type { BracketSide } from '@/types/admin';
import {
  buildBracketGraph,
  validateBracketGraph,
} from '@/utils/bracket/buildGraph';
import {
  generateSingleElim,
  generateDoubleElim,
} from '@/utils/bracket/generateBracket';
import type { Audited } from '../../_shared/audited';
import type { AuditDetails } from '@/utils/admin/defineAdminRoute';
import * as repo from '../repository/matches';
import { fail, failWith, type StatusResult } from './common';

const truthy = (v: unknown) => v === '1' || v === 'true';
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/* ---------------------------------------------------------------------------
 * Liste (filtres + pagination) — réponse `{ matches }` toujours présente,
 * `stages` / `total` / `tournament` seulement quand demandés.
 * ------------------------------------------------------------------------ */

export async function listMatches(
  ctx: ServiceContext,
  tournamentId: string,
  query: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const orderField =
    query.orderBy === 'scheduled_at'
      ? 'scheduled_at'
      : query.orderBy === 'round_number'
        ? 'round_number'
        : 'created_at';
  const withStages = truthy(query.includeStages);
  const withTotal = truthy(query.includeTotal);

  // roundNumber : entier, sinon le filtre est ignoré.
  const roundRaw = firstString(query.roundNumber);
  const roundParsed =
    roundRaw !== undefined && roundRaw !== '' ? Number(roundRaw) : Number.NaN;

  // search : équipes résolues en amont, réutilisées par la liste ET le compte.
  const searchTerm = sanitizeSearch(
    query.search as string | string[] | undefined,
    100
  );
  const searchSafe = searchTerm ? escapePostgrestValue(searchTerm) : '';
  let searchOr: string | null = null;
  if (searchSafe) {
    const pattern = `%${searchSafe}%`;
    const teamsRes = await repo.teamIdsMatching(ctx.db, ctx.tenantId, pattern);
    if (teamsRes.error) {
      ctx.logger.error(
        'admin GET tournament matches teams lookup error:',
        teamsRes.error
      );
    }
    const teamIds = (teamsRes.data ?? []).map((r) => r.id).filter(Boolean);
    const clauses = [
      `round_name.ilike.${pattern}`,
      `lobby_code.ilike.${pattern}`,
      `notes.ilike.${pattern}`,
    ];
    if (teamIds.length > 0) {
      const list = teamIds.join(',');
      clauses.push(`team1_id.in.(${list})`, `team2_id.in.(${list})`);
    }
    if (isValidUUID(searchTerm)) clauses.push(`id.eq.${searchTerm}`);
    searchOr = clauses.join(',');
  }

  const filters: repo.MatchListFilters = {
    stageId: str(query.stageId),
    status: str(query.status),
    bracketSide: str(query.bracketSide),
    groupKey: str(query.groupKey),
    roundNumber: Number.isInteger(roundParsed) ? roundParsed : null,
    result: str(query.result),
    dateFrom: str(query.dateFrom),
    dateTo: str(query.dateTo),
    searchOr,
  };

  const { data, error } = await repo.listMatches(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    filters,
    {
      withTeams: truthy(query.includeTeams),
      withGames: truthy(query.includeGames),
      orderField,
      ascending: query.orderDir === 'asc',
      offset: page.offset,
      limit: page.limit,
    }
  );
  if (error) {
    ctx.logger.error('admin GET tournament matches error:', error);
    fail(500, 'Failed to fetch matches');
  }

  const body: {
    matches: unknown[];
    stages?: unknown[];
    total?: number;
    tournament?: unknown;
  } = { matches: (data ?? []) as unknown[] };

  if (withTotal) {
    const { count, error: countErr } = await repo.countMatches(
      ctx.db,
      ctx.tenantId,
      tournamentId,
      filters
    );
    if (countErr) {
      ctx.logger.error('admin GET tournament matches count error:', countErr);
    }
    body.total = typeof count === 'number' ? count : 0;
  }
  if (withStages) {
    const { data: stages, error: stagesErr } = await repo.stageSummaries(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    if (stagesErr) {
      ctx.logger.error('admin GET tournament matches stages error:', stagesErr);
    }
    body.stages = stages ?? [];
  }
  // En-tête du tournoi (dont `timezone`) : évite à la page un second appel à
  // /api/admin/tournament/[id], qui répond 403 à un arbitre.
  if (withStages || withTotal) {
    const { data: t, error: tErr } = await repo.tournamentHeader(
      ctx.db,
      ctx.tenantId,
      tournamentId
    );
    if (tErr) {
      ctx.logger.error('admin GET tournament matches tournament error:', tErr);
    }
    body.tournament = t ?? null;
  }
  return body;
}

/* ---------------------------------------------------------------------------
 * Isolation : tout id reçu (URL ou corps) est recoupé avec le tenant — et
 * avec le tournoi de l'URL pour les phases et les matchs liés — AVANT toute
 * écriture. Le client service bypasse la RLS.
 * ------------------------------------------------------------------------ */

async function assertTournamentInTenant(
  ctx: ServiceContext,
  tournamentId: string
) {
  const { data, error } = await repo.tournamentHeader(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (error) {
    ctx.logger.error('admin tournament lookup error:', error);
    fail(500, 'Failed to verify tournament');
  }
  if (!data) fail(404, 'Tournament not found');
}

type RefKind = 'stage' | 'team' | 'match';
type Ref = { kind: RefKind; field: string; value: unknown };

/** Refus 404 `CROSS_TENANT_REF` si une référence n'est pas du tenant. */
async function assertRefsInTenant(
  ctx: ServiceContext,
  tournamentId: string,
  refs: Ref[]
) {
  const wanted: Record<RefKind, Set<string>> = {
    stage: new Set(),
    team: new Set(),
    match: new Set(),
  };
  const present = refs.filter((r) => r.value !== null && r.value !== undefined);
  for (const r of present) {
    if (typeof r.value !== 'string' || !isValidUUID(r.value)) {
      fail(400, `Invalid ${r.field}`);
    }
    wanted[r.kind].add(r.value);
  }
  const lookups = {
    stage: repo.stageIdsOfTournament,
    team: (db: typeof ctx.db, tenantId: string, _t: string, ids: string[]) =>
      repo.teamIdsInTenant(db, tenantId, ids),
    match: repo.matchIdsOfTournament,
  };
  const found: Record<RefKind, Set<string>> = {
    stage: new Set(),
    team: new Set(),
    match: new Set(),
  };
  for (const kind of ['stage', 'team', 'match'] as const) {
    if (wanted[kind].size === 0) continue;
    const { ids, error } = await lookups[kind](
      ctx.db,
      ctx.tenantId,
      tournamentId,
      [...wanted[kind]]
    );
    if (error) {
      ctx.logger.error('admin tournament refs lookup error:', error);
      fail(500, 'Failed to verify references');
    }
    found[kind] = ids;
  }
  for (const r of present) {
    if (!found[r.kind].has(r.value as string)) {
      failWith(404, `${r.field} not found`, 'CROSS_TENANT_REF', {
        field: r.field,
      });
    }
  }
}

/* ---------------------------------------------------------------------------
 * Création en lot
 * ------------------------------------------------------------------------ */

type MatchCreateInput = Record<string, unknown>;

export async function createMatches(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { matches } = body;
  if (!Array.isArray(matches) || matches.length === 0) {
    fail(400, "Body must include non-empty array 'matches'");
  }
  await assertTournamentInTenant(ctx, tournamentId);
  const refs: Ref[] = [];
  (matches as unknown[]).forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      fail(400, `Invalid matches[${i}]`);
    }
    const m = raw as MatchCreateInput;
    refs.push(
      { kind: 'stage', field: `matches[${i}].stage_id`, value: m.stage_id },
      { kind: 'team', field: `matches[${i}].team1_id`, value: m.team1_id },
      { kind: 'team', field: `matches[${i}].team2_id`, value: m.team2_id },
      {
        kind: 'match',
        field: `matches[${i}].next_match_win_id`,
        value: m.next_match_win_id,
      },
      {
        kind: 'match',
        field: `matches[${i}].next_match_lose_id`,
        value: m.next_match_lose_id,
      }
    );
  });
  await assertRefsInTenant(ctx, tournamentId, refs);
  const nowIso = new Date().toISOString();
  const v = <T>(x: unknown) => (x as T | undefined) ?? null;
  const rows = (matches as MatchCreateInput[]).map((m) => ({
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    stage_id: v<string>(m.stage_id),
    status: (m.status as string | undefined) ?? 'pending',
    is_bye: (m.is_bye as boolean | undefined) ?? false,
    match_format: v<string>(m.match_format),
    round_name: v<string>(m.round_name),
    round_number: typeof m.round_number === 'number' ? m.round_number : null,
    bracket_side: v<string>(m.bracket_side),
    group_key: v<string>(m.group_key),
    team1_id: v<string>(m.team1_id),
    team2_id: v<string>(m.team2_id),
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: v<string>(m.scheduled_at),
    completed_at: null,
    stream_url: v<string>(m.stream_url),
    lobby_code: v<string>(m.lobby_code),
    notes: v<string>(m.notes),
    next_match_win_id: v<string>(m.next_match_win_id),
    next_match_win_slot: v<number>(m.next_match_win_slot),
    next_match_lose_id: v<string>(m.next_match_lose_id),
    next_match_lose_slot: v<number>(m.next_match_lose_slot),
    created_at: nowIso,
    updated_at: null,
  }));

  const { data, error } = await repo.insertMatches(ctx.db, rows);
  if (error) {
    ctx.logger.error('admin POST tournament matches error:', error);
    fail(500, 'Failed to create matches');
  }
  const inserted = data ?? [];
  return {
    result: { matches: inserted },
    audit: {
      entity_type: 'match',
      entity_id: inserted.length === 1 ? inserted[0].id : null,
      tournament_id: tournamentId,
      payload: {
        batch: true,
        count: inserted.length,
        match_ids: inserted.map((m) => m.id),
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Bracket : generate | generate_double_elim | save | validate
 * ------------------------------------------------------------------------ */

type BracketOutcome = { response: StatusResult<unknown>; audit: AuditDetails };

const VALID_BRACKET_SIZES = [4, 8, 16, 32];

export async function runBracketAction(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<BracketOutcome> {
  switch (body.action) {
    case 'generate':
    case 'generate_double_elim':
      return generate(ctx, tournamentId, body);
    case 'save':
      return saveBracket(ctx, tournamentId, body);
    case 'validate':
      return validateBracket(ctx, tournamentId, body);
    default:
      fail(
        400,
        "action must be 'generate', 'generate_double_elim', 'save', or 'validate'"
      );
  }
}

async function generate(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<BracketOutcome> {
  const size = body.size as number;
  // Défauts de DÉSTRUCTURATION (seul `undefined` les déclenche) : un
  // `bestOf: null` explicite reste null (pas de format de match).
  const bestOf = (body.bestOf === undefined ? 3 : body.bestOf) as number;
  const startDate = body.startDate as string | undefined;
  const intervalMinutes = (
    body.intervalMinutes === undefined ? 60 : body.intervalMinutes
  ) as number;
  const stageId = (body.stageId as string | undefined) ?? null;
  if (!VALID_BRACKET_SIZES.includes(size)) {
    fail(400, `size must be one of: ${VALID_BRACKET_SIZES.join(', ')}`);
  }
  await assertTournamentInTenant(ctx, tournamentId);
  await assertRefsInTenant(ctx, tournamentId, [
    { kind: 'stage', field: 'stageId', value: stageId },
  ]);

  const double = body.action === 'generate_double_elim';
  const grandFinalReset = (
    body.grandFinalReset === undefined ? false : body.grandFinalReset
  ) as boolean;
  const common = {
    tenantId: ctx.tenantId,
    tournamentId,
    stageId,
    size,
    bestOf,
    startDate,
    intervalMinutes,
  };
  const result = double
    ? await generateDoubleElim({ ...common, grandFinalReset })
    : await generateSingleElim(common);
  if (!result.ok) fail(500, result.error);

  const rows = result.rows;
  const payload = double
    ? {
        type: 'double_elimination',
        size,
        bestOf,
        grandFinalReset,
        match_count: rows.length,
        wb_matches: rows.filter((r) => r.bracket_side === 'wb').length,
        lb_matches: rows.filter((r) => r.bracket_side === 'lb').length,
        gf_matches: rows.filter((r) => r.bracket_side === 'final').length,
      }
    : {
        size,
        bestOf,
        startDate,
        intervalMinutes,
        match_count: rows.length,
        match_ids: rows.map((r) => r.id),
      };
  return {
    response: {
      status: 201,
      body: {
        ok: true,
        match_count: rows.length,
        match_ids: rows.map((r) => r.id),
      },
    },
    audit: {
      action: 'create_match',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload,
    },
  };
}

async function saveBracket(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<BracketOutcome> {
  const matches = body.matches as Record<string, unknown>[] | undefined;
  if (!Array.isArray(matches) || matches.length === 0) {
    fail(400, "Body must include non-empty array 'matches'");
  }
  // Équipes placées : du tenant, sinon rien n'est écrit (les matchs, eux,
  // sont filtrés par tenant + tournoi à l'écriture).
  await assertRefsInTenant(
    ctx,
    tournamentId,
    matches.flatMap((m, i) => [
      {
        kind: 'team' as const,
        field: `matches[${i}].team1_id`,
        value: m?.team1_id,
      },
      {
        kind: 'team' as const,
        field: `matches[${i}].team2_id`,
        value: m?.team2_id,
      },
    ])
  );
  const errors: string[] = [];
  for (const m of matches) {
    const patch: Record<string, unknown> = {};
    if ('team1_id' in m) patch.team1_id = m.team1_id ?? null;
    if ('team2_id' in m) patch.team2_id = m.team2_id ?? null;
    if ('scheduled_at' in m) patch.scheduled_at = m.scheduled_at ?? null;
    const { error } = await repo.updateTournamentMatch(
      ctx.db,
      ctx.tenantId,
      tournamentId,
      m.id as string,
      patch as TablesUpdate<'matches'>
    );
    if (error) errors.push(`Match ${m.id}: update failed`);
  }
  if (errors.length > 0) ctx.logger.error('bracket save errors:', errors);

  return {
    response:
      errors.length > 0
        ? {
            status: 207,
            body: {
              ok: false,
              errors,
              updated: matches.length - errors.length,
            },
          }
        : { status: 200, body: { ok: true, updated: matches.length } },
    audit: {
      action: 'update_bracket',
      entity_type: 'tournament',
      entity_id: tournamentId,
      tournament_id: tournamentId,
      payload: {
        match_count: matches.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    },
  };
}

async function validateBracket(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
): Promise<BracketOutcome> {
  const stageId = typeof body.stageId === 'string' ? body.stageId : null;
  await assertTournamentInTenant(ctx, tournamentId);
  if (stageId) {
    await assertRefsInTenant(ctx, tournamentId, [
      { kind: 'stage', field: 'stageId', value: stageId },
    ]);
  }
  const { data, error } = await repo.bracketGraphRows(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    stageId || null
  );
  if (error) {
    ctx.logger.error('bracket validate: fetch error', error);
    fail(500, 'Failed to fetch matches');
  }
  const matches: MatchForGraph[] = (data ?? []).map((m) => ({
    id: m.id,
    tournament_id: m.tournament_id as string,
    round_number: m.round_number ?? 0,
    bracket_side: (m.bracket_side as BracketSide | null) ?? 'none',
    group_key: m.group_key ?? null,
    next_match_win_id: m.next_match_win_id ?? null,
    next_match_lose_id: m.next_match_lose_id ?? null,
  }));
  const validation = validateBracketGraph(buildBracketGraph(matches));
  // Lecture seule : rien à journaliser.
  return { response: { status: 200, body: validation }, audit: { skip: true } };
}
