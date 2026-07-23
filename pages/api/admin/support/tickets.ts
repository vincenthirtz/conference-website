// pages/api/admin/support/tickets.ts
// Admin: list support tickets with filters.
// GET: ?status=&severity=&category=&tournament_id=&search=&offset=&limit=
//
// MULTI-TENANT NOTE (intentional, documented decision — no migration):
// `support_tickets` has NO `tenant_id` column, so this endpoint is deliberately
// GLOBAL: any `manager`+ sees every tenant's tickets. On this mono-tenant
// instance that is the desired behaviour and support is kept tenant-agnostic on
// purpose. The day a 2nd tenant is onboarded, this MUST change: add a
// `tenant_id` column to `support_tickets` (+ backfill migration) and scope both
// the list query AND the aggregate counts below by `req.staffContext` tenant,
// mirroring how the tenant-scoped admin endpoints filter. Until then, leaving it
// global is a conscious trade-off, not an oversight.
// See docs/BOT_API_CONTRACT.md › "Tenant identification" for the product call.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { escapePostgrestValue } from '@/utils/apiHelpers';

import { logger } from '../../../../utils/logger';

const SEARCH_MAX_LENGTH = 100;
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;
const VALID_CATEGORIES = ['dispute', 'behavior', 'technical', 'other'] as const;

export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const { status, severity, category, tournament_id } = req.query;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  // Normalise filters once so the page query AND the aggregate counts apply the
  // exact same scoping (search included). Each consumer re-applies them onto its
  // own query builder.
  const statusFilter =
    typeof status === 'string' &&
    (VALID_STATUSES as readonly string[]).includes(status)
      ? status
      : null;
  const severityFilter =
    typeof severity === 'string' &&
    (VALID_SEVERITIES as readonly string[]).includes(severity)
      ? severity
      : null;
  const categoryFilter =
    typeof category === 'string' &&
    (VALID_CATEGORIES as readonly string[]).includes(category)
      ? category
      : null;
  const tournamentFilter =
    typeof tournament_id === 'string' && tournament_id ? tournament_id : null;

  // Free-text search (admin UI ?search=). Applies on top of the other
  // filters: matches when subject OR message OR reporter_name contains the
  // substring (case-insensitive). PostgREST-sensitive characters (, . * ( ) \)
  // are stripped via escapePostgrestValue so user input can't alter the .or()
  // structure; the surrounding %…% keeps it a substring match.
  const rawSearch = req.query.search;
  const search =
    typeof rawSearch === 'string'
      ? rawSearch.trim().slice(0, SEARCH_MAX_LENGTH)
      : '';
  const searchPattern = search
    ? (() => {
        const safe = escapePostgrestValue(search);
        return safe ? `%${safe}%` : null;
      })()
    : null;

  // PostgREST filter builders are chainable and re-assignable; the generated
  // types are not friendly to progressive re-assignment after .eq/.or, so we
  // type them loosely inside this contained helper (the rest of the route stays
  // strict). Same approach as pages/api/admin/disputes/index.ts.
  type FilterBuilder = any;

  // Builds a support_tickets query with the shared list filters (status /
  // severity / category / tournament / search) applied, so the page list AND the
  // aggregate counts stay in sync (same scoping). Centralised on purpose.
  const buildFilteredQuery = (
    select: string,
    opts: { count?: 'exact'; head?: boolean } = {}
  ): FilterBuilder => {
    let q: FilterBuilder = supabaseAdmin!
      .from('support_tickets')
      .select(select, { count: opts.count, head: opts.head });
    if (statusFilter) q = q.eq('status', statusFilter);
    if (severityFilter) q = q.eq('severity', severityFilter);
    if (categoryFilter) q = q.eq('category', categoryFilter);
    if (tournamentFilter) q = q.eq('tournament_id', tournamentFilter);
    if (searchPattern) {
      q = q.or(
        `subject.ilike.${searchPattern},message.ilike.${searchPattern},reporter_name.ilike.${searchPattern}`
      );
    }
    return q;
  };

  // Page query: full rows for the current window, with the filtered total.
  const pageQuery = buildFilteredQuery(
    'id, tournament_id, reporter_name, reporter_email, is_anonymous, category, severity, subject, message, status, resolved_at, resolution_note, source, discord_user_id, discord_username, reported_target_type, reported_target_name, reported_battle_tag, converted_player_blacklist_id, converted_entity_blacklist_id, created_at, updated_at',
    { count: 'exact' }
  )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Aggregate counts over the WHOLE filtered set (head:true → no rows shipped).
  // These power the dashboard cards so they reflect the full result set, not the
  // paginated page. Each respects the same status/severity/category/search scope.
  const openCountQuery = buildFilteredQuery('id', {
    count: 'exact',
    head: true,
  }).eq('status', 'open');
  // "Haute sévérité (actifs)" = high severity AND still actionable (not
  // resolved/closed), matching the previous client-side definition. Expressed as
  // two .neq() (status != resolved AND status != closed) rather than a NOT IN so
  // it stays equivalent to "status not in (resolved, closed)".
  const highCountQuery = buildFilteredQuery('id', {
    count: 'exact',
    head: true,
  })
    .eq('severity', 'high')
    .neq('status', 'resolved')
    .neq('status', 'closed');
  // "Résolus / fermés" = resolved OR closed.
  const resolvedCountQuery = buildFilteredQuery('id', {
    count: 'exact',
    head: true,
  }).in('status', ['resolved', 'closed']);

  const [pageResult, openResult, highResult, resolvedResult] =
    await Promise.all([
      pageQuery,
      openCountQuery,
      highCountQuery,
      resolvedCountQuery,
    ]);

  const firstError =
    pageResult.error ||
    openResult.error ||
    highResult.error ||
    resolvedResult.error;
  if (firstError) {
    logger.error('[admin/support/tickets] list error:', firstError);
    return res.status(500).json({ error: 'Échec du chargement' });
  }

  return res.status(200).json({
    tickets: pageResult.data || [],
    total: pageResult.count ?? null,
    limit,
    offset,
    counts: {
      total: pageResult.count ?? 0,
      open: openResult.count ?? 0,
      high_severity: highResult.count ?? 0,
      resolved: resolvedResult.count ?? 0,
    },
  });
}
