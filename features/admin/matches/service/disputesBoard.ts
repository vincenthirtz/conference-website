// features/admin/matches/service/disputesBoard.ts — tableau transverse des
// litiges ouverts (/admin/disputes), scopé à l'espace du staff.
//
// Filtres en base (tenant, `disputed`, tournoi, fenêtre SLA), relations
// embarquées (pas de N+1), comptes par classification en count-only.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  ageInMinutes,
  classifyAge,
  getSlaMinutes,
  type SLAClassification,
} from '@/utils/disputes/slaBreaches';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import {
  DISPUTE_BOARD_COLUMNS,
  buildFilteredQuery,
  classificationWindow,
  type DisputeQueryBase,
} from '../repository/disputesBoard';

/** Recopie de DISPUTE_BOARD_COLUMNS ; relations dénouées par `oneRelation`. */
type DisputeListRow = {
  id: string;
  tournament_id: string | null;
  team1_id: string | null;
  team2_id: string | null;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  escalation_pinged_at: string | null;
  team1: Relation<{ id: string; name: string | null }>;
  team2: Relation<{ id: string; name: string | null }>;
  tournament: Relation<{ id: string; name: string; slug: string | null }>;
};

const ORDER_BY_ALLOWLIST = new Set([
  'dispute_opened_at',
  'updated_at',
  'created_at',
]);

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function parseStatus(v: unknown): SLAClassification | null {
  const s = queryString(v);
  if (s === 'breached' || s === 'approaching' || s === 'fresh') return s;
  return null;
}

export async function getDisputeBoard(
  ctx: ServiceContext,
  q: Record<string, unknown>,
  page: { limit: number; offset: number }
) {
  const tournamentId = queryString(q.tournament_id);
  if (tournamentId && !isValidUUID(tournamentId)) {
    throw new LegacyAdminError(400, 'Invalid tournament_id');
  }
  const status = parseStatus(q.status);
  if (q.status && !status) throw new LegacyAdminError(400, 'Invalid status');

  const orderByRaw = queryString(q.orderBy);
  const orderBy =
    orderByRaw && ORDER_BY_ALLOWLIST.has(orderByRaw)
      ? orderByRaw
      : 'dispute_opened_at';
  // Défaut : plus ancien litige d'abord ; plus récent d'abord sinon.
  const orderDirRaw = queryString(q.orderDir);
  const ascending =
    orderDirRaw === 'asc'
      ? true
      : orderDirRaw === 'desc'
        ? false
        : orderBy === 'dispute_opened_at';
  const wantTotal = q.includeTotal === '1' || q.includeTotal === 'true';

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

    const { data, error, count } = await buildFilteredQuery(
      ctx.db,
      DISPUTE_BOARD_COLUMNS,
      base,
      { count: wantTotal ? 'exact' : undefined }
    )
      .order(orderBy, { ascending, nullsFirst: false })
      .range(page.offset, page.offset + page.limit - 1);
    if (error) {
      ctx.logger.error('[/api/admin/disputes] list query error', error);
      throw new LegacyAdminError(500, 'Failed to fetch disputes');
    }

    const disputes = ((data ?? []) as DisputeListRow[]).map((row) => {
      const team1 = oneRelation(row.team1);
      const team2 = oneRelation(row.team2);
      const tournament = oneRelation(row.tournament);
      const ageMinutes = ageInMinutes(row.dispute_opened_at, nowMs);
      return {
        matchId: row.id,
        tournament: tournament
          ? {
              id: tournament.id,
              name: tournament.name,
              slug: tournament.slug ?? null,
            }
          : null,
        team1: team1
          ? { id: team1.id, name: team1.name ?? null }
          : row.team1_id
            ? { id: row.team1_id, name: null }
            : null,
        team2: team2
          ? { id: team2.id, name: team2.name ?? null }
          : row.team2_id
            ? { id: row.team2_id, name: null }
            : null,
        disputeReason: row.dispute_reason ?? null,
        disputeOpenedAt: row.dispute_opened_at ?? null,
        escalationPingedAt: row.escalation_pinged_at ?? null,
        ageMinutes,
        slaMinutes,
        classification: classifyAge(ageMinutes, slaMinutes),
      };
    });

    // Comptes par classification (count-only) : même filtre tournoi, SANS
    // le filtre de classification — les cartes montrent toute la répartition.
    const countBase: DisputeQueryBase = { ...base, status: null };
    const w = classificationWindow('approaching', slaMinutes, nowMs);
    const breachedBefore = new Date(nowMs - slaMinutes * 60_000).toISOString();
    const head = { count: 'exact' as const, head: true };

    const [totalR, breachedR, approachingR] = await Promise.all([
      buildFilteredQuery(ctx.db, 'id', countBase, head),
      buildFilteredQuery(ctx.db, 'id', countBase, head).lte(
        'dispute_opened_at',
        breachedBefore
      ),
      buildFilteredQuery(ctx.db, 'id', countBase, head)
        .gt('dispute_opened_at', breachedBefore)
        .lte('dispute_opened_at', w.approachBefore!),
    ]);

    const totalCount = totalR.count ?? 0;
    const breachedCount = breachedR.count ?? 0;
    const approachingCount = approachingR.count ?? 0;

    return {
      disputes,
      counts: {
        total: totalCount,
        breached: breachedCount,
        approaching: approachingCount,
        fresh: Math.max(0, totalCount - breachedCount - approachingCount),
      },
      total: typeof count === 'number' ? count : null,
    };
  } catch (err) {
    if (err instanceof LegacyAdminError) throw err;
    ctx.logger.error('[/api/admin/disputes] error', err);
    throw new LegacyAdminError(500, 'Internal server error');
  }
}
