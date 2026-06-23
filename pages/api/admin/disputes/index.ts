// pages/api/admin/disputes/index.ts
// GET : cross-tournament board of open disputes for /admin/disputes.
// Scoped to the staff member's current tenant (via ctx.tenantId).
//
// Perf hardening:
//   - DB-level filtering (tenant_id, status='disputed', tournament_id, SLA
//     classification translated to dispute_opened_at thresholds) BEFORE fetch.
//   - PostgREST embedded select (team1 / team2 / tournament) instead of a
//     per-match enrichment loop → no N+1.
//   - Pagination via parsePagination + .range(); exact count when includeTotal.
//   - Classification counts computed with count-only HEAD queries (no rows),
//     so the Stat cards stay accurate across the whole filtered set.
//
// Query params:
//   - tournament_id?: uuid             → filter on a tournament
//   - status?: breached|approaching|fresh → SLA classification filter (DB-level)
//   - orderBy?: dispute_opened_at|updated_at|created_at (default dispute_opened_at)
//   - orderDir?: asc|desc              → default depends on orderBy
//   - limit?: number (default 50)
//   - offset?: number (default 0)
//   - includeTotal?: '1'|'true'        → include exact total of the page query
//
// Response:
// {
//   disputes: DisputeRow[],
//   counts: { total, breached, approaching, fresh },
//   total: number | null
// }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID, parsePagination } from '@/utils/apiHelpers';
import {
  ageInMinutes,
  classifyAge,
  getSlaMinutes,
  type SLAClassification,
} from '@/utils/disputes/slaBreaches';
import { logger } from '../../../../utils/logger';

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

// Only what the page renders / sorts on. Embedded relations resolved via FKs
// (matches_team1_id_fkey, matches_team2_id_fkey, tournament FK).
const SELECT_COLUMNS = `
  id,
  tournament_id,
  team1_id,
  team2_id,
  dispute_reason,
  dispute_opened_at,
  escalation_pinged_at,
  team1:teams!matches_team1_id_fkey(id, name),
  team2:teams!matches_team2_id_fkey(id, name),
  tournament:tournaments(id, name, slug)
`;

const ORDER_BY_ALLOWLIST = new Set([
  'dispute_opened_at',
  'updated_at',
  'created_at',
]);

type ClassificationFilter = SLAClassification;

function parseStatus(v: unknown): ClassificationFilter | null {
  const s = queryString(v);
  if (s === 'breached' || s === 'approaching' || s === 'fresh') return s;
  return null;
}

/**
 * Translate an SLA classification into a `dispute_opened_at` window so the
 * filter can run at the DB level. Returns ISO bounds:
 *   - older (inclusive lower bound on dispute_opened_at, i.e. age <= max age)
 *   - newer (exclusive upper-ish bound, i.e. age >= min age)
 *
 *   breached    : age >= SLA            → opened_at <= now - SLA
 *   approaching : 0.75*SLA <= age < SLA → now - SLA < opened_at <= now - 0.75*SLA
 *   fresh       : age < 0.75*SLA        → opened_at > now - 0.75*SLA (or NULL)
 */
function classificationWindow(
  cls: ClassificationFilter,
  slaMinutes: number,
  nowMs: number
): { breachedBefore?: string; approachBefore?: string } {
  const minToMs = (m: number) => m * 60_000;
  const breachedBefore = new Date(nowMs - minToMs(slaMinutes)).toISOString();
  const approachBefore = new Date(
    nowMs - minToMs(slaMinutes * 0.75)
  ).toISOString();
  if (cls === 'breached') return { breachedBefore };
  if (cls === 'approaching') return { breachedBefore, approachBefore };
  return { approachBefore };
}

type DisputeQueryBase = {
  tenantId: string;
  tournamentId: string | null;
  status: ClassificationFilter | null;
  slaMinutes: number;
  nowMs: number;
};

// PostgREST filter builders are chainable and re-assignable; the generated
// types are not friendly to progressive re-assignment after .eq/.gt/.or, so
// we type them loosely inside this contained helper (the rest of the route
// stays strict).
type FilterBuilder = any;

/**
 * Build the base query for `matches` scoped to tenant + disputed status, then
 * apply the shared DB-level filters (tournament + SLA classification window).
 * Centralised so the list query and the count queries stay in sync.
 */
function buildFilteredQuery(
  select: string,
  base: DisputeQueryBase,
  opts: { count?: 'exact'; head?: boolean } = {}
): FilterBuilder {
  let query: FilterBuilder = supabaseAdmin
    .from('matches')
    .select(select, { count: opts.count, head: opts.head })
    .eq('tenant_id', base.tenantId)
    .eq('status', 'disputed');

  if (base.tournamentId) {
    query = query.eq('tournament_id', base.tournamentId);
  }

  if (base.status) {
    const w = classificationWindow(base.status, base.slaMinutes, base.nowMs);
    if (base.status === 'breached') {
      query = query.lte('dispute_opened_at', w.breachedBefore!);
    } else if (base.status === 'approaching') {
      query = query
        .gt('dispute_opened_at', w.breachedBefore!)
        .lte('dispute_opened_at', w.approachBefore!);
    } else {
      // fresh: opened recently OR no opened_at recorded
      query = query.or(
        `dispute_opened_at.gt.${w.approachBefore!},dispute_opened_at.is.null`
      );
    }
  }

  return query;
}

export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const tournamentId = queryString(req.query.tournament_id);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament_id' });
  }

  const status = parseStatus(req.query.status);
  if (req.query.status && !status) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const orderByRaw = queryString(req.query.orderBy);
  const orderBy =
    orderByRaw && ORDER_BY_ALLOWLIST.has(orderByRaw)
      ? orderByRaw
      : 'dispute_opened_at';
  // Default: oldest dispute first (asc) for the board; newest-first for the
  // generic timestamp columns.
  const orderDirRaw = queryString(req.query.orderDir);
  const ascending =
    orderDirRaw === 'asc'
      ? true
      : orderDirRaw === 'desc'
        ? false
        : orderBy === 'dispute_opened_at';

  const { limit, offset } = parsePagination(req, { limit: 50 });
  const wantTotal =
    req.query.includeTotal === '1' || req.query.includeTotal === 'true';

  try {
    const nowMs = Date.now();
    const slaMinutes = await getSlaMinutes(ctx.tenantId);
    const base: DisputeQueryBase = {
      tenantId: ctx.tenantId,
      tournamentId,
      status,
      slaMinutes,
      nowMs,
    };

    // --- Page query (rows + optional exact total) ---
    const listQuery = buildFilteredQuery(SELECT_COLUMNS, base, {
      count: wantTotal ? 'exact' : undefined,
    })
      .order(orderBy, { ascending, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await listQuery;
    if (error) {
      logger.error('[/api/admin/disputes] list query error', error);
      return res.status(500).json({ error: 'Failed to fetch disputes' });
    }

    const disputes = ((data ?? []) as any[]).map((m) => {
      const ageMinutes = ageInMinutes(m.dispute_opened_at, nowMs);
      return {
        matchId: m.id,
        tournament: m.tournament
          ? {
              id: m.tournament.id,
              name: m.tournament.name,
              slug: m.tournament.slug ?? null,
            }
          : null,
        team1: m.team1
          ? { id: m.team1.id, name: m.team1.name ?? null }
          : m.team1_id
            ? { id: m.team1_id, name: null }
            : null,
        team2: m.team2
          ? { id: m.team2.id, name: m.team2.name ?? null }
          : m.team2_id
            ? { id: m.team2_id, name: null }
            : null,
        disputeReason: m.dispute_reason ?? null,
        disputeOpenedAt: m.dispute_opened_at ?? null,
        escalationPingedAt: m.escalation_pinged_at ?? null,
        ageMinutes,
        slaMinutes,
        classification: classifyAge(ageMinutes, slaMinutes),
      };
    });

    // --- Classification counts (count-only HEAD queries, no rows) ---
    // Scoped to the same tournament filter as the board, but ignoring the
    // `status` classification filter so the Stat cards always show the full
    // breakdown for the selected tournament.
    const countBase: DisputeQueryBase = { ...base, status: null };
    const w = classificationWindow('approaching', slaMinutes, nowMs);
    const breachedBefore = new Date(nowMs - slaMinutes * 60_000).toISOString();

    const totalQ = buildFilteredQuery('id', countBase, {
      count: 'exact',
      head: true,
    });
    const breachedQ = buildFilteredQuery('id', countBase, {
      count: 'exact',
      head: true,
    }).lte('dispute_opened_at', breachedBefore);
    const approachingQ = buildFilteredQuery('id', countBase, {
      count: 'exact',
      head: true,
    })
      .gt('dispute_opened_at', breachedBefore)
      .lte('dispute_opened_at', w.approachBefore!);

    const [totalR, breachedR, approachingR] = await Promise.all([
      totalQ,
      breachedQ,
      approachingQ,
    ]);

    const totalCount = totalR.count ?? 0;
    const breachedCount = breachedR.count ?? 0;
    const approachingCount = approachingR.count ?? 0;
    const freshCount = Math.max(
      0,
      totalCount - breachedCount - approachingCount
    );

    const counts = {
      total: totalCount,
      breached: breachedCount,
      approaching: approachingCount,
      fresh: freshCount,
    };

    return res.status(200).json({
      disputes,
      counts,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err) {
    logger.error('[/api/admin/disputes] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
