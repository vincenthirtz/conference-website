// pages/admin/tournament/[id]/dashboard.tsx
// Vue synthetique de la progression d'un tournoi.

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import { formatDateTimeTz } from '@/utils/timezone';

type StageProgress = {
  id: string;
  name: string;
  stage_type: string | null;
  order_index: number | null;
  is_active: boolean;
  totalMatches: number;
  finishedMatches: number;
  pendingMatches: number;
  ongoingMatches: number;
  cancelledMatches: number;
  teamsCount: number;
};

type UpcomingMatch = {
  id: string;
  stage_id: string | null;
  stage_name: string | null;
  round_number: number | null;
  round_name: string | null;
  scheduled_at: string | null;
  team1_name: string | null;
  team2_name: string | null;
  stream_url: string | null;
};

type Alert = {
  type: 'warning' | 'info' | 'error';
  message: string;
};

type DashboardData = {
  tournament: {
    id: string;
    name: string;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
  };
  summary: {
    totalTeams: number;
    totalMatches: number;
    finishedMatches: number;
    pendingMatches: number;
    ongoingMatches: number;
    completionPercent: number;
    eliminatedTeams: number;
    activeTeams: number;
  };
  stages: StageProgress[];
  upcomingMatches: UpcomingMatch[];
  alerts: Alert[];
};

export const getServerSideProps = withStaffPage('manager');

// formatDateTime is now handled via formatDateTimeTz from the timezone utility

function stageTypeLabel(type: string | null) {
  switch (type) {
    case 'group': return 'Poule';
    case 'bracket': return 'Bracket';
    case 'swiss': return 'Swiss';
    case 'round_robin': return 'Round Robin';
    case 'showmatch': return 'Showmatch';
    default: return 'Autre';
  }
}

function DashboardPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/dashboard`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger le dashboard');
      }
      setData(await res.json());
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const s = data?.summary;

  return (
    <>
      <Head>
        <title>Admin - Dashboard tournoi</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push(`/admin/tournament/${tournamentId}`)}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour au tournoi
            </button>

            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {data?.tournament.name || 'Dashboard'}
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Progression du tournoi
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Exporter
                  </button>
                  <div className="invisible group-hover:visible absolute right-0 mt-1 w-48 bg-neutral-800 border border-neutral-700 rounded-xl shadow-lg z-10 py-1">
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=csv`}
                      className="block px-4 py-2 text-sm hover:bg-neutral-700 transition-colors"
                    >
                      Resultats CSV
                    </a>
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=json`}
                      className="block px-4 py-2 text-sm hover:bg-neutral-700 transition-colors"
                    >
                      Resultats JSON
                    </a>
                  </div>
                </div>
                <button
                  onClick={fetchDashboard}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
                >
                  Rafraichir
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-xl bg-red-900/40 border border-red-500/50 text-sm">
              {errorMsg}
            </div>
          )}

          {!loading && data && s && (
            <div className="space-y-6">
              {/* Alerts */}
              {data.alerts.length > 0 && (
                <div className="space-y-2">
                  {data.alerts.map((alert, i) => (
                    <div
                      key={i}
                      className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
                        alert.type === 'error'
                          ? 'bg-red-900/40 border-red-500/50 text-red-200'
                          : alert.type === 'warning'
                            ? 'bg-amber-900/40 border-amber-500/50 text-amber-200'
                            : 'bg-blue-900/40 border-blue-500/50 text-blue-200'
                      }`}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        {alert.type === 'error' ? (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        ) : (
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        )}
                      </svg>
                      {alert.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SummaryCard
                  label="Equipes"
                  value={s.totalTeams}
                  sub={`${s.activeTeams} actives · ${s.eliminatedTeams} eliminees`}
                  color="blue"
                />
                <SummaryCard
                  label="Matchs termines"
                  value={`${s.finishedMatches} / ${s.totalMatches}`}
                  sub={`${s.completionPercent}% complete`}
                  color="emerald"
                />
                <SummaryCard
                  label="En cours"
                  value={s.ongoingMatches}
                  sub={`${s.pendingMatches} en attente`}
                  color="amber"
                />
                <SummaryCard
                  label="Progression"
                  value={`${s.completionPercent}%`}
                  sub={`${s.totalMatches - s.finishedMatches} restants`}
                  color="purple"
                  isProgress
                  percent={s.completionPercent}
                />
              </div>

              {/* Stage Progress */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Progression par phase</h2>
                <div className="space-y-4">
                  {data.stages.map((stage) => {
                    const pct = stage.totalMatches > 0
                      ? Math.round((stage.finishedMatches / stage.totalMatches) * 100)
                      : 0;

                    return (
                      <div key={stage.id} className="bg-neutral-900/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/admin/stages/${stage.id}`}
                              className="font-medium text-sm hover:text-blue-400 transition-colors"
                            >
                              {stage.name}
                            </Link>
                            <span className="text-xs text-neutral-500">
                              {stageTypeLabel(stage.stage_type)}
                            </span>
                            {stage.is_active && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {stage.teamsCount} equipe(s) · {stage.finishedMatches}/{stage.totalMatches} matchs
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
                          {stage.ongoingMatches > 0 && (
                            <span className="text-amber-400">{stage.ongoingMatches} en cours</span>
                          )}
                          {stage.pendingMatches > 0 && (
                            <span>{stage.pendingMatches} en attente</span>
                          )}
                          {stage.cancelledMatches > 0 && (
                            <span className="text-red-400">{stage.cancelledMatches} annules</span>
                          )}
                          <span className="ml-auto font-medium text-white">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}

                  {data.stages.length === 0 && (
                    <p className="text-sm text-neutral-500">Aucune phase configuree.</p>
                  )}
                </div>
              </section>

              {/* Upcoming Matches */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">Prochains matchs</h2>
                {data.upcomingMatches.length > 0 ? (
                  <div className="border border-neutral-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-900/80 text-neutral-400 text-xs uppercase tracking-wider">
                          <th className="px-4 py-2 text-left">Phase</th>
                          <th className="px-4 py-2 text-left">Ronde</th>
                          <th className="px-4 py-2 text-left">Equipe 1</th>
                          <th className="px-4 py-2 text-center">vs</th>
                          <th className="px-4 py-2 text-left">Equipe 2</th>
                          <th className="px-4 py-2 text-left">Horaire</th>
                          <th className="px-4 py-2 text-center">Stream</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.upcomingMatches.map((m) => (
                          <tr key={m.id} className="border-t border-neutral-700/50 hover:bg-neutral-700/30 transition-colors">
                            <td className="px-4 py-2 text-neutral-300 text-xs">
                              {m.stage_name || '—'}
                            </td>
                            <td className="px-4 py-2 text-neutral-400 text-xs">
                              {m.round_name || (m.round_number ? `R${m.round_number}` : '—')}
                            </td>
                            <td className="px-4 py-2 font-medium">
                              {m.team1_name || <span className="text-neutral-500">TBD</span>}
                            </td>
                            <td className="px-4 py-2 text-center text-neutral-500 text-xs">vs</td>
                            <td className="px-4 py-2 font-medium">
                              {m.team2_name || <span className="text-neutral-500">TBD</span>}
                            </td>
                            <td className="px-4 py-2 text-neutral-400 text-xs">
                              {formatDateTimeTz(m.scheduled_at, data?.tournament.timezone, { year: undefined })}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {m.stream_url ? (
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Stream attribue" />
                              ) : (
                                <span className="inline-block w-2 h-2 rounded-full bg-neutral-600" title="Pas de stream" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">Aucun match a venir.</p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
  isProgress,
  percent,
}: {
  label: string;
  value: string | number;
  sub: string;
  color: 'blue' | 'emerald' | 'amber' | 'purple';
  isProgress?: boolean;
  percent?: number;
}) {
  const colors = {
    blue: 'from-blue-600/20 to-blue-600/5 border-blue-500/30',
    emerald: 'from-emerald-600/20 to-emerald-600/5 border-emerald-500/30',
    amber: 'from-amber-600/20 to-amber-600/5 border-amber-500/30',
    purple: 'from-purple-600/20 to-purple-600/5 border-purple-500/30',
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-b p-5 ${colors[color]}`}>
      <div className="text-xs text-neutral-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500 mt-1">{sub}</div>
      {isProgress && percent !== undefined && (
        <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
