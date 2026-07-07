// pages/admin/logs.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../utils/logger';
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type StaffLog = {
  id: string;
  created_at: string;
  staff_id: string | null;
  staff_role: string | null;
  staff_display_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  tournament_id: string | null;
  stage_id: string | null;
  match_id: string | null;
  team_id: string | null;
  payload: any | null;
  message: string | null;
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

export const getServerSideProps = withStaffPage('manager');

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
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

function shortId(id: string | null | undefined) {
  if (!id) return '';
  if (id.length <= 8) return id;
  return id.slice(0, 4) + '…' + id.slice(-3);
}

function AdminLogsPage({ staff }: StaffProps) {
  const router = useRouter();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const t = useAdminT('adminLogs');

  const [logs, setLogs] = useState<StaffLog[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tournaments, setTournaments] = useState<TournamentMini[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(false);

  // Filtres
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [staffId, setStaffId] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [stageId, setStageId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchTournaments();
  }, []);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    offset,
    entityType,
    action,
    staffId,
    tournamentId,
    stageId,
    matchId,
    teamId,
  ]);

  async function fetchTournaments() {
    try {
      setLoadingTournaments(true);
      const res = await adminFetch('/api/admin/tournaments?limit=200');
      if (!res.ok) return;
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (e) {
      logger.error('Failed to load tournaments for logs filter', e);
    } finally {
      setLoadingTournaments(false);
    }
  }

  async function fetchLogs() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('includeTotal', '1');
      if (entityType.trim()) params.set('entityType', entityType.trim());
      if (action.trim()) params.set('action', action.trim());
      if (staffId.trim()) params.set('staffId', staffId.trim());
      if (tournamentId.trim()) params.set('tournamentId', tournamentId.trim());
      if (stageId.trim()) params.set('stageId', stageId.trim());
      if (matchId.trim()) params.set('matchId', matchId.trim());
      if (teamId.trim()) params.set('teamId', teamId.trim());
      if (search.trim()) params.set('search', search.trim());
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const json = await adminFetchJson<LogsApiResponse>(
        '/api/admin/logs?' + params.toString()
      );
      setLogs(json.logs || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchLogs();
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              {t.backToDashboard}
            </button>

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

              <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-2 rounded-xl border border-neutral-700/50">
                {t.sortedByDate}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
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
              {errorMsg}
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
                <input
                  type="text"
                  placeholder={t.placeholderAction}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                />
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
                          {formatDateTime(log.created_at)}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/30">
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
                          {log.staff_role && (
                            <span className="px-2 py-0.5 rounded-lg bg-neutral-700/50 border border-neutral-600/50 text-[10px] uppercase tracking-wide text-neutral-400">
                              {log.staff_role}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tags row */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {log.tournament_id && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] bg-amber-900/30 border border-amber-700/30 text-amber-300">
                          {format(t.tagTournament, {
                            id: shortId(log.tournament_id),
                          })}
                        </span>
                      )}
                      {log.stage_id && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] bg-purple-900/30 border border-purple-700/30 text-purple-300">
                          {format(t.tagStage, { id: shortId(log.stage_id) })}
                        </span>
                      )}
                      {log.match_id && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] bg-emerald-900/30 border border-emerald-700/30 text-emerald-300">
                          {format(t.tagMatch, { id: shortId(log.match_id) })}
                        </span>
                      )}
                      {log.team_id && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] bg-cyan-900/30 border border-cyan-700/30 text-cyan-300">
                          {format(t.tagTeam, { id: shortId(log.team_id) })}
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    {log.message && (
                      <p className="text-sm text-neutral-200 mb-2">
                        {log.message}
                      </p>
                    )}

                    {/* Payload + Links */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {log.payload && (
                        <details className="text-xs text-neutral-400">
                          <summary className="cursor-pointer select-none hover:text-neutral-200 transition-colors">
                            {t.detailsPayload}
                          </summary>
                          <pre className="mt-2 bg-neutral-900/70 border border-neutral-700/50 rounded-xl p-3 text-[11px] overflow-x-auto max-h-48">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </details>
                      )}

                      <div className="flex flex-wrap gap-3 text-xs">
                        {log.tournament_id && (
                          <Link
                            href={`/admin/tournament/${log.tournament_id}`}
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
                        {log.stage_id && (
                          <Link
                            href={`/admin/stages/${log.stage_id}`}
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
                            {t.linkStage}
                          </Link>
                        )}
                        {log.match_id && (
                          <Link
                            href={`/admin/matches/${log.match_id}`}
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
                            {t.linkMatch}
                          </Link>
                        )}
                        {log.team_id && (
                          <Link
                            href={`/admin/teams/${log.team_id}`}
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
                            {t.linkTeam}
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
        </div>
      </div>
    </>
  );
}

export default AdminLogsPage;
