import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import {
  STAFF_LOG_ACTION_LABELS,
  STAFF_LOG_ACTION_OPTIONS,
} from '@/utils/staffLogs';
import type { StaffLogAction } from '@/types/staffLogs';

import { logger } from '../../../utils/logger';
import nsAdminLogs from '@/lib/i18n/locales/admin-fr/adminLogs';

/**
 * Shape of a row returned by GET /api/admin/logs. The API selects only these
 * columns (+ resolved `staff_display_name` and the `formatStaffLog` extras).
 * The historical `stage_id` / `match_id` / `team_id` / `message` / `staff_role`
 * fields are NOT columns of `staff_logs` and are no longer returned — they used
 * to render as perpetually-empty tags and have been dropped.
 */
type StaffLog = {
  id: string;
  created_at: string;
  staff_id: string | null;
  staff_display_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  tournament_id: string | null;
  tenant_id: string | null;
  payload: unknown;
};

type LogsApiResponse = {
  logs: StaffLog[];
  total: number | null;
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type TournamentsApiResponse = {
  tournaments: TournamentMini[];
  total: number | null;
};

// BCP-47 locale for the active app language (dates render in the user's own
// timezone automatically — `Intl` defaults to the runtime zone).
const DATE_LOCALE: Record<'fr' | 'en', string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

function formatDateTime(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Readable FR label for an action slug, with a graceful fallback to the raw slug.
function actionLabel(action: string): string {
  return STAFF_LOG_ACTION_LABELS[action as StaffLogAction] ?? action;
}

// Known admin routes an `entity_type` maps to, so we can deep-link from a log
// row using entity_type + entity_id (the real columns) instead of the dropped
// dedicated *_id fields.
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  match: (id) => `/admin/matches/${id}`,
  stage: (id) => `/admin/stages/${id}`,
  team: (id) => `/admin/teams/${id}`,
  tournament: (id) => `/admin/tournament/${id}/dashboard`,
};

function shortId(id: string | null | undefined) {
  if (!id) return '';
  if (id.length <= 8) return id;
  return id.slice(0, 4) + '…' + id.slice(-3);
}

/**
 * "Staff" tab of the merged /admin/logs page: staff activity audit log with
 * filters and pagination.
 */
export default function StaffLogsPanel() {
  const { adminFetch } = useAdminFetch();
  const t = useAdminT(nsAdminLogs);
  const { lang } = useLang();
  const dateLocale = DATE_LOCALE[lang];

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Filtres réactifs : refetch immédiat sur changement, SANS reset d'offset
  // (comportement d'origine).
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [staffId, setStaffId] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [stageId, setStageId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [teamId, setTeamId] = useState('');

  // Filtres appliqués au submit uniquement (recherche + plage de dates) :
  // l'input local n'agit qu'après « Filtrer » (comme avant).
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  // Liste paginée. `limit: 100` réplique le défaut de /api/admin/logs.
  // includeTotal reste actif (le handler ne renvoie le count exact que sous ce
  // flag). Filtres réactifs + appliqués passés en `params` : un changement de
  // filtre réactif refetch sans toucher l'offset ; le submit applique la
  // recherche/dates et repart page 1 via resetOffset().
  const {
    data: logs,
    total,
    loading,
    error: errorMsg,
    offset,
    limit,
    setOffset,
    resetOffset,
  } = useAdminResource<StaffLog, LogsApiResponse>('/api/admin/logs', {
    limit: 100,
    params: {
      entityType: entityType.trim(),
      action: action.trim(),
      staffId: staffId.trim(),
      tournamentId: tournamentId.trim(),
      stageId: stageId.trim(),
      matchId: matchId.trim(),
      teamId: teamId.trim(),
      search: appliedSearch.trim(),
      from: appliedFrom,
      to: appliedTo,
    },
    select: (res) => res.logs || [],
  });

  // Dropdown tournois : endpoint distinct, chargé une fois au montage.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoadingTournaments(true);
        const res = await adminFetch('/api/admin/tournaments?limit=200');
        if (!res.ok) return;
        const json: TournamentsApiResponse = await res.json();
        if (active) setTournaments(json.tournaments || []);
      } catch (e) {
        logger.error('Failed to load tournaments for logs filter', e);
      } finally {
        if (active) setLoadingTournaments(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adminFetch]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(search);
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    resetOffset();
  }

  // Currently-applied filter set, shared by the read hook and the CSV export so
  // the export mirrors exactly what the list shows.
  const currentFilters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {
      entityType: entityType.trim(),
      action: action.trim(),
      staffId: staffId.trim(),
      tournamentId: tournamentId.trim(),
      stageId: stageId.trim(),
      matchId: matchId.trim(),
      teamId: teamId.trim(),
      search: appliedSearch.trim(),
      from: appliedFrom,
      to: appliedTo,
    };
    return f;
  }, [
    entityType,
    action,
    staffId,
    tournamentId,
    stageId,
    matchId,
    teamId,
    appliedSearch,
    appliedFrom,
    appliedTo,
  ]);

  // CSV export. Reuses `adminFetch` so the request carries the Supabase Bearer
  // token (the endpoint is admin-gated via withStaffRoute) — a bare
  // window.open() would drop the auth header and 401. fetch → blob → anchor.
  async function handleExportCsv() {
    if (exporting) return;
    setExportError(null);
    setExporting(true);

    const params = new URLSearchParams();
    params.set('format', 'csv');
    for (const [key, value] of Object.entries(currentFilters)) {
      if (value) params.set(key, value);
    }

    const url = `/api/admin/logs?${params.toString()}`;
    try {
      const res = await adminFetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `staff-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      logger.error('Staff logs CSV export failed', e);
      setExportError(t.exportError);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {total !== null
                ? format(
                    total > 1 ? t.countActions_other : t.countActions_one,
                    { count: total }
                  )
                : t.loading}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              )}
              {exporting ? t.exporting : t.exportCsv}
            </button>

            <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-2 rounded-xl border border-neutral-700/50">
              {t.sortedByDate}
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {(errorMsg || exportError) && (
        <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {errorMsg || exportError}
        </div>
      )}

      {/* Filters */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
        <form
          onSubmit={handleFilterSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end"
        >
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelEntityType}
            </label>
            <input
              type="text"
              placeholder={t.placeholderEntityType}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelAction}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">{t.allActions}</option>
              {STAFF_LOG_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelStaff}
            </label>
            <input
              type="text"
              placeholder={t.placeholderStaff}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelTournament}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              disabled={loadingTournaments}
            >
              <option value="">
                {loadingTournaments ? t.loading : t.allTournaments}
              </option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.slug ? ` (${t.slug})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelSearch}
            </label>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                aria-label={t.placeholderSearch}
                placeholder={t.placeholderSearch}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {t.filter}
            </button>
          </div>

          {/* Additional filters row */}
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelStageId}
            </label>
            <input
              type="text"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              placeholder={t.placeholderStage}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelMatchId}
            </label>
            <input
              type="text"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder={t.placeholderMatch}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelTeamId}
            </label>
            <input
              type="text"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder={t.placeholderTeam}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelFrom}
            </label>
            <input
              type="date"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelTo}
            </label>
            <input
              type="date"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </form>
      </section>

      {/* Logs List */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t.empty}
          </div>
        ) : (
          <div className="divide-y divide-neutral-700/50">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-neutral-700/30 transition-colors"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-neutral-500 bg-neutral-900/50 px-2 py-1 rounded-lg">
                      {formatDateTime(log.created_at, dateLocale)}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30"
                      title={log.action}
                    >
                      {actionLabel(log.action)}
                    </span>
                    {/* Raw slug kept visible & subtle for debugging. */}
                    <span className="text-[10px] font-mono text-neutral-600">
                      {log.action}
                    </span>
                    {log.entity_type && (
                      <span className="px-2.5 py-1 rounded-lg text-xs bg-neutral-700/50 text-neutral-300 border border-neutral-600/50">
                        {log.entity_type}
                        {log.entity_id ? ` #${shortId(log.entity_id)}` : ''}
                      </span>
                    )}
                  </div>

                  {log.staff_id && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-500">{t.by}</span>
                      <span className="font-medium text-neutral-200">
                        {log.staff_display_name || shortId(log.staff_id)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tags row — only fields that actually exist on staff_logs. */}
                {log.tournament_id && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] bg-amber-900/30 border border-amber-700/30 text-amber-300">
                      {format(t.tagTournament, {
                        id: shortId(log.tournament_id),
                      })}
                    </span>
                  </div>
                )}

                {/* Payload + Links */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {log.payload != null &&
                  !(
                    typeof log.payload === 'object' &&
                    Object.keys(log.payload as object).length === 0
                  ) ? (
                    <details className="text-xs text-neutral-400 min-w-0 flex-1">
                      <summary className="cursor-pointer select-none hover:text-neutral-200 transition-colors">
                        {t.detailsPayload}
                      </summary>
                      <pre className="mt-2 bg-neutral-900/70 border border-neutral-700/50 rounded-xl p-3 text-[11px] leading-relaxed overflow-auto max-h-64 whitespace-pre-wrap break-words">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span />
                  )}

                  <div className="flex flex-wrap gap-3 text-xs shrink-0">
                    {log.entity_type &&
                      log.entity_id &&
                      ENTITY_ROUTES[log.entity_type] && (
                        <Link
                          href={ENTITY_ROUTES[log.entity_type](log.entity_id)}
                          className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          {t.linkEntity}
                        </Link>
                      )}
                    {log.tournament_id && log.entity_type !== 'tournament' && (
                      <Link
                        href={`/admin/tournament/${log.tournament_id}/dashboard`}
                        className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        {t.linkTournament}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pagination */}
      {logs.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.previous}
          </button>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + logs.length}
            {total ? format(t.paginationTotal, { total }) : ''}
          </span>

          <button
            type="button"
            disabled={total !== null && offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {t.next}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
