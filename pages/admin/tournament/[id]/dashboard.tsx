// pages/admin/tournament/[id]/dashboard.tsx
// Mega-dashboard "Centre de contrôle" du tournoi.
// Remplace l'ancienne vue lecture-seule par un hub actionnable :
// KPIs, alertes priorisées, status workflow, phases, équipes,
// matchs en cours / à venir / disputes, check-in du jour, accès rapide aux 15 sous-pages.

import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage, hasAtLeastRole } from '@/utils/staff';
import type { StaffProps, StaffRole } from '@/types/admin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { formatDateTimeTz } from '@/utils/timezone';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import StatCard from '@/components/admin/dashboard/StatCard';
import ActionableAlert from '@/components/admin/dashboard/ActionableAlert';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import StageProgressBar from '@/components/admin/dashboard/StageProgressBar';
import UpcomingMatchRow from '@/components/admin/dashboard/UpcomingMatchRow';
import ScoreEntryModal from '@/components/admin/dashboard/ScoreEntryModal';
import DisputeResolveModal from '@/components/admin/dashboard/DisputeResolveModal';
import ConfirmAdvanceModal from '@/components/admin/dashboard/ConfirmAdvanceModal';
import SupportTicketsDonut from '@/components/admin/dashboard/SupportTicketsDonut';
import DiscordHealthGrid from '@/components/admin/dashboard/DiscordHealthGrid';
import {
  fetchDashboardData,
  type DashboardData,
} from '@/utils/dashboard/buildTournamentDashboard';

/* -----------------------------------------------------------
 * Constantes UI
 * ---------------------------------------------------------*/

const REFRESH_INTERVAL_MS = 30_000;

const STATUS_PILL_STYLE: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  published: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  running: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  completed: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  archived: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
};

type Dict = ReturnType<typeof useAdminT<'adminTournamentDashboard'>>;

function getStatusLabel(tx: Dict): Record<string, string> {
  return {
    draft: tx.statusDraft,
    published: tx.statusPublished,
    running: tx.statusRunning,
    completed: tx.statusCompleted,
    archived: tx.statusArchived,
  };
}

/* -----------------------------------------------------------
 * Quick access grid des 15 sous-pages
 * ---------------------------------------------------------*/

type QuickLink = {
  label: string;
  href: (id: string) => string;
  icon: string;
  description: string;
  /** Rôle minimum requis par la page cible (défaut : manager, comme le dashboard). */
  role?: 'manager' | 'admin';
};

function getQuickLinks(tx: Dict): QuickLink[] {
  return [
    {
      label: tx.quickStagesLabel,
      icon: '🧱',
      href: (id) => `/admin/tournament/${id}/stages`,
      description: tx.quickStagesDesc,
    },
    {
      label: tx.quickMatchesLabel,
      icon: '🎯',
      href: (id) => `/admin/tournament/${id}/matches`,
      description: tx.quickMatchesDesc,
    },
    {
      label: tx.quickBracketLabel,
      icon: '🏆',
      href: (id) => `/admin/tournament/${id}/bracket`,
      description: tx.quickBracketDesc,
    },
    {
      label: tx.quickBracketBuilderLabel,
      icon: '🛠️',
      href: (id) => `/admin/tournament/${id}/bracket-builder`,
      description: tx.quickBracketBuilderDesc,
    },
    {
      label: tx.quickMapsLabel,
      icon: '🗺️',
      href: (id) => `/admin/tournament/${id}/maps`,
      description: tx.quickMapsDesc,
    },
    {
      label: tx.quickMapDrawLabel,
      icon: '🎲',
      href: (id) => `/admin/tournament/${id}/map-draw`,
      description: tx.quickMapDrawDesc,
    },
    {
      label: tx.quickVetoLabel,
      icon: '🚫',
      href: (id) => `/admin/tournament/${id}/veto`,
      description: tx.quickVetoDesc,
    },
    {
      label: tx.quickCheckinLabel,
      icon: '✅',
      href: (id) => `/admin/tournament/${id}/checkin`,
      description: tx.quickCheckinDesc,
    },
    {
      label: tx.quickBulkOpsLabel,
      icon: '⚡',
      href: (id) => `/admin/tournament/${id}/bulk-ops`,
      description: tx.quickBulkOpsDesc,
    },
    {
      label: tx.quickStatsLabel,
      icon: '📊',
      href: (id) => `/admin/tournament/${id}/stats`,
      description: tx.quickStatsDesc,
    },
    {
      label: tx.quickAnalyticsLabel,
      icon: '📈',
      href: (id) => `/admin/tournament/${id}/analytics`,
      description: tx.quickAnalyticsDesc,
    },
    {
      label: tx.quickDiscordLabel,
      icon: '🔔',
      href: (id) => `/admin/tournament/${id}/discord`,
      description: tx.quickDiscordDesc,
      role: 'admin',
    },
    {
      label: tx.quickHistoryLabel,
      icon: '📜',
      href: (id) => `/admin/tournament/${id}/history`,
      description: tx.quickHistoryDesc,
    },
    {
      label: tx.quickEditLabel,
      icon: '✏️',
      href: (id) => `/admin/tournament/${id}/edit`,
      description: tx.quickEditDesc,
    },
    {
      label: tx.quickSupportLabel,
      icon: '🛂',
      href: () => `/admin/support`,
      description: tx.quickSupportDesc,
    },
    {
      label: tx.quickTemplatesLabel,
      icon: '🧬',
      href: () => `/admin/tournament-templates`,
      description: tx.quickTemplatesDesc,
      role: 'manager',
    },
    {
      label: tx.quickSimulatorLabel,
      icon: '🧪',
      href: () => `/admin/tournament-simulator`,
      description: tx.quickSimulatorDesc,
      role: 'manager',
    },
  ];
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function jDayLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  try {
    const target = new Date(iso);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return null;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days >= 1) return `J-${days}`;
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    return `${hours}h`;
  } catch {
    return null;
  }
}

/* -----------------------------------------------------------
 * Page
 * ---------------------------------------------------------*/

type SsrProps = {
  initialData: DashboardData | null;
  initialError: string | null;
};

export const getServerSideProps = withStaffPage<SsrProps>(
  'manager',
  async (ctx) => {
    const rawId = ctx.params?.id ?? ctx.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id)
      return { initialData: null, initialError: 'Invalid tournament id' };

    const result = await fetchDashboardData(String(id));
    if (!result.ok) {
      return { initialData: null, initialError: result.error };
    }
    return { initialData: result.data, initialError: null };
  }
);

type Props = StaffProps & SsrProps;

function MegaDashboardPage({ staff, initialData, initialError }: Props) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const tx = useAdminT('adminTournamentDashboard');
  const STATUS_LABEL = getStatusLabel(tx);
  const QUICK_LINKS = getQuickLinks(tx);

  const [loading, setLoading] = useState(initialData == null);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(
    initialData ? new Date() : null
  );
  const [stale, setStale] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Modales d'actions inline
  type MatchTarget = {
    id: string;
    team1Name: string | null;
    team2Name: string | null;
    team1Score?: number | null;
    team2Score?: number | null;
    matchFormat?: string | null;
  };
  const [scoreTarget, setScoreTarget] = useState<MatchTarget | null>(null);
  const [disputeTarget, setDisputeTarget] = useState<
    (MatchTarget & { reason: string | null }) | null
  >(null);
  const [advanceTarget, setAdvanceTarget] = useState<{
    stageId: string;
    stageName: string;
  } | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/dashboard`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || tx.errorLoad);
      }
      setData(await res.json());
      setLastFetchedAt(new Date());
      setStale(false);
      setErrorMsg(null);
    } catch (err: unknown) {
      // Garde le snapshot précédent et passe en mode stale.
      setStale(true);
      setErrorMsg((err as Error)?.message || tx.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, tx]);

  // Auto-refresh (pause si onglet caché). Pas de fetch initial : SSR a déjà
  // chargé les données via getServerSideProps. Sert aussi de filet de
  // securite si la souscription realtime tombe (cf. useRealtimeChannel).
  useEffect(() => {
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchDashboard();
    }
    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDashboard]);

  // Realtime : refresh immediat quand un match du tournoi change (score,
  // statut, scheduled_at, dispute…). Bien plus reactif que d'attendre 30s.
  // Le polling reste actif comme filet de securite.
  useRealtimeChannel({
    enabled: !!tournamentId,
    channel: `dashboard-matches-${tournamentId}`,
    table: 'matches',
    filter: tournamentId ? `tournament_id=eq.${tournamentId}` : undefined,
    onChange: fetchDashboard,
  });

  // Tick "now" toutes les 60s pour le compteur roster-lock et la fraîcheur de l'ETA.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const t = data?.tournament;
  const s = data?.summary;
  const sig = data?.signals;
  const now = new Date(nowMs);

  // Live roster lock countdown : recalculé à chaque tick de `nowMs` (60s).
  // Permet d'afficher minutes restantes quand on passe sous l'heure.
  const liveRosterLock = (() => {
    const lockedAt = t?.roster_locked_at;
    if (!lockedAt) return null;
    const diffMs = new Date(lockedAt).getTime() - nowMs;
    if (diffMs <= 0) return { passed: true, label: tx.rosterLocked };
    const minutes = Math.ceil(diffMs / 60_000);
    if (minutes < 60) return { passed: false, label: `${minutes} min` };
    const hours = Math.ceil(diffMs / 3_600_000);
    if (hours < 48) return { passed: false, label: `${hours}h` };
    const days = Math.floor(diffMs / (24 * 3_600_000));
    return { passed: false, label: `${days}j` };
  })();

  // ETA fin du tournoi : on recalcule l'écart depuis maintenant pour avoir
  // un libellé qui se rafraîchit (ex : "dans 2h" → "dans 1h" sans nouveau fetch).
  const liveEta = (() => {
    const etaIso = sig?.velocity.etaIso;
    if (!etaIso) return null;
    const diffMs = new Date(etaIso).getTime() - nowMs;
    if (diffMs <= 0) return { label: tx.etaImminent, iso: etaIso };
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 1) {
      const minutes = Math.round(diffMs / 60_000);
      return { label: format(tx.etaInMinutes, { n: minutes }), iso: etaIso };
    }
    if (hours < 36)
      return { label: format(tx.etaInHours, { n: hours }), iso: etaIso };
    const days = Math.round(hours / 24);
    return { label: format(tx.etaInDays, { n: days }), iso: etaIso };
  })();

  // Prochain match à venir (pour J-X header)
  const nextScheduled = data?.upcomingMatches.find(
    (m) => m.scheduled_at
  )?.scheduled_at;
  const jDayHeader =
    jDayLabel(nextScheduled ?? null, now) ??
    jDayLabel(t?.start_date ?? null, now) ??
    null;

  // Quels stages sont prêts à advance ?
  const readyStageIds = new Set(
    sig?.stagesReadyToAdvance.map((s) => s.stageId) ?? []
  );

  return (
    <>
      <Head>
        <title>
          {format(tx.pageTitle, { name: t?.name ?? tx.defaultTournamentName })}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto max-w-[1500px] px-4 pb-14 pt-20 sm:px-6 lg:px-8">
          {/* ─── Header ────────────────────────────────────────────── */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => router.push(`/admin/tournament/${tournamentId}`)}
              className="mb-3 inline-flex items-center gap-2 text-xs text-neutral-400 transition-colors hover:text-white"
            >
              <svg
                className="h-3.5 w-3.5"
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
              {tx.back}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {t?.name ?? tx.loadingName}
                  </h1>
                  {t?.status && (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        STATUS_PILL_STYLE[t.status] ?? STATUS_PILL_STYLE.draft
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  )}
                  {sig && sig.liveMatches.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                      {format(tx.liveCount, { count: sig.liveMatches.length })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  {tx.controlCenter}
                  {jDayHeader && (
                    <>
                      {tx.nextKickoffBefore}
                      <span className="text-purple-300">{jDayHeader}</span>
                    </>
                  )}
                  {lastFetchedAt && (
                    <>
                      {' · '}
                      <span
                        className={
                          stale ? 'text-amber-300' : 'text-neutral-500'
                        }
                      >
                        {stale ? tx.stale : tx.upToDate} ·{' '}
                        {lastFetchedAt.toLocaleTimeString('fr-FR')}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    {tx.export}
                  </button>
                  <div className="invisible absolute right-0 z-10 mt-1 w-48 rounded-xl border border-neutral-700 bg-neutral-800 py-1 shadow-lg group-hover:visible">
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=csv`}
                      className="block px-4 py-2 text-sm transition-colors hover:bg-neutral-700"
                    >
                      {tx.resultsCsv}
                    </a>
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=json`}
                      className="block px-4 py-2 text-sm transition-colors hover:bg-neutral-700"
                    >
                      {tx.resultsJson}
                    </a>
                  </div>
                </div>
                <button
                  onClick={fetchDashboard}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-700"
                >
                  {tx.refresh}
                </button>
              </div>
            </div>
          </div>

          {/* ─── Loading / error initial ────────────────────────────── */}
          {loading && !data && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400">
              {tx.loadingDashboard}
            </div>
          )}
          {errorMsg && !data && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          {data && t && s && sig && (
            <>
              {/* ─── KPIs ───────────────────────────────────────────── */}
              <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                <StatCard
                  label={tx.kpiTeams}
                  value={`${s.activeTeams}/${s.totalTeams}`}
                  hint={format(tx.kpiTeamsEliminated, {
                    count: s.eliminatedTeams,
                  })}
                  accent="pink"
                />
                <StatCard
                  label={tx.kpiMatches}
                  value={`${s.finishedMatches}/${s.totalMatches}`}
                  hint={format(tx.kpiMatchesDone, {
                    percent: s.completionPercent,
                  })}
                  accent="emerald"
                />
                <StatCard
                  label={tx.kpiOngoing}
                  value={s.ongoingMatches}
                  hint={s.ongoingMatches > 0 ? tx.kpiLive : '—'}
                  accent={s.ongoingMatches > 0 ? 'red' : 'gray'}
                />
                <StatCard
                  label={tx.kpiStages}
                  value={data.stages.length}
                  hint={
                    data.stages.find((st) => st.is_active)?.name ??
                    tx.kpiNoActiveStage
                  }
                  accent="blue"
                />
                <StatCard
                  label={tx.kpiCadence}
                  value={
                    sig.velocity.matchesPerHour > 0
                      ? `${sig.velocity.matchesPerHour}/h`
                      : '—'
                  }
                  hint={
                    sig.velocity.finishedInWindow > 0
                      ? format(tx.kpiCadenceHint, {
                          count: sig.velocity.finishedInWindow,
                          hours: sig.velocity.windowHours,
                        })
                      : tx.kpiNoRecentActivity
                  }
                  accent={sig.velocity.matchesPerHour > 0 ? 'emerald' : 'gray'}
                />
                <StatCard
                  label={tx.kpiEta}
                  value={
                    liveEta?.label ??
                    (sig.velocity.remainingMatches === 0 ? tx.kpiCompleted : '—')
                  }
                  hint={
                    liveEta?.iso
                      ? formatDateTimeTz(liveEta.iso, t.timezone, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : sig.velocity.remainingMatches === 0
                        ? tx.kpiAllPlayed
                        : tx.kpiCadenceTooLow
                  }
                  accent={liveEta ? 'purple' : 'gray'}
                />
                <StatCard
                  label={tx.kpiStart}
                  value={
                    t.start_date
                      ? formatDateTimeTz(t.start_date, t.timezone, {
                          dateStyle: 'medium',
                        })
                      : '—'
                  }
                  hint={
                    t.end_date
                      ? `→ ${formatDateTimeTz(t.end_date, t.timezone, { dateStyle: 'medium' })}`
                      : undefined
                  }
                  accent="amber"
                />
              </div>

              {/* ─── Alertes actionnables (rendu seulement si signal ≠ 0) ── */}
              <div className="mb-6 space-y-2">
                {sig.disputesOpen.count > 0 && (
                  <ActionableAlert
                    severity="error"
                    icon={<span>⚠️</span>}
                    title={format(
                      sig.disputesOpen.count > 1
                        ? tx.disputesOpenTitle_other
                        : tx.disputesOpenTitle_one,
                      { count: sig.disputesOpen.count }
                    )}
                    message={tx.disputesOpenMsg}
                    cta={{
                      label: tx.resolve,
                      href: `/admin/tournament/${tournamentId}/matches?status=disputed`,
                    }}
                  />
                )}
                {sig.disputesBlockingDownstream?.count > 0 && (
                  <ActionableAlert
                    severity="error"
                    icon={<span>🧱</span>}
                    title={format(tx.disputesBlockingTitle, {
                      disputes: sig.disputesBlockingDownstream.count,
                      matches: sig.disputesBlockingDownstream.impactedMatchCount,
                    })}
                    message={tx.disputesBlockingMsg}
                    cta={{
                      label: tx.view,
                      href: `/admin/tournament/${tournamentId}/matches?status=disputed`,
                    }}
                  />
                )}
                {sig.conflictsCount > 0 && (
                  <div className="group relative">
                    <ActionableAlert
                      severity="warning"
                      icon={<span>🚨</span>}
                      title={format(
                        sig.conflictsCount > 1
                          ? tx.conflictsTitle_other
                          : tx.conflictsTitle_one,
                        { count: sig.conflictsCount }
                      )}
                      message={tx.conflictsMsg}
                      cta={{
                        label: tx.view,
                        href: `/admin/tournament/${tournamentId}`,
                      }}
                    />
                    {sig.conflictsList.length > 0 && (
                      <div className="invisible absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-amber-500/30 bg-neutral-900/98 p-3 shadow-2xl backdrop-blur-sm group-hover:visible">
                        <p className="mb-2 text-[10px] uppercase tracking-widest text-amber-300">
                          {tx.conflictsDetailLabel}{' '}
                          {sig.conflictsCount > sig.conflictsList.length
                            ? format(tx.conflictsDetailPartial, {
                                shown: sig.conflictsList.length,
                                total: sig.conflictsCount,
                              })
                            : ''}
                        </p>
                        <ul className="space-y-1.5 text-xs">
                          {sig.conflictsList.map((c, i) => {
                            const fmtTime = (iso: string) => {
                              try {
                                return new Date(iso).toLocaleTimeString(
                                  'fr-FR',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'Europe/Paris',
                                  }
                                );
                              } catch {
                                return iso;
                              }
                            };
                            return (
                              <li
                                key={i}
                                className="flex items-start gap-2 rounded-md bg-amber-500/5 p-1.5"
                              >
                                <span className="font-semibold text-amber-200">
                                  {c.teamName ?? c.teamId.slice(0, 8)}
                                </span>
                                <span className="text-neutral-400">
                                  {format(tx.conflictMatchInfo, {
                                    timeA: fmtTime(c.matchAScheduledAt),
                                    timeB: fmtTime(c.matchBScheduledAt),
                                  })}
                                </span>
                                <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200 tabular-nums">
                                  ↔ {c.overlapMinutes}min
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {sig.checkinNext24h.missing > 0 &&
                  sig.checkinNext24h.upcoming > 0 && (
                    <ActionableAlert
                      severity="warning"
                      icon={<span>🔔</span>}
                      title={format(
                        sig.checkinNext24h.missing > 1
                          ? tx.checkinMissingTitle_other
                          : tx.checkinMissingTitle_one,
                        { count: sig.checkinNext24h.missing }
                      )}
                      message={format(tx.checkinMissingMsg, {
                        count: sig.checkinNext24h.upcoming,
                      })}
                      cta={{
                        label: tx.checkin,
                        href: `/admin/tournament/${tournamentId}/checkin`,
                      }}
                    />
                  )}
                {sig.supportHighOpen > 0 && (
                  <ActionableAlert
                    severity="critical"
                    icon={<span>🛂</span>}
                    title={format(
                      sig.supportHighOpen > 1
                        ? tx.supportCriticalTitle_other
                        : tx.supportCriticalTitle_one,
                      { count: sig.supportHighOpen }
                    )}
                    message={tx.supportCriticalMsg}
                    cta={{ label: tx.open, href: '/admin/support' }}
                  />
                )}
                {liveRosterLock &&
                  !liveRosterLock.passed &&
                  sig.rosterLockProximity.hoursLeft !== null &&
                  sig.rosterLockProximity.hoursLeft <= 24 && (
                    <ActionableAlert
                      severity="warning"
                      icon={<span>🔒</span>}
                      title={format(tx.rosterLockTitle, {
                        label: liveRosterLock.label,
                      })}
                      message={
                        sig.rosterLockProximity.teamsBelowMin > 0
                          ? format(tx.rosterLockBelowMin, {
                              count: sig.rosterLockProximity.teamsBelowMin,
                            })
                          : tx.rosterLockCheck
                      }
                      cta={{
                        label: tx.edit,
                        href: `/admin/tournament/${tournamentId}/edit`,
                      }}
                    />
                  )}
                {sig.stagesReadyToAdvance.length > 0 && (
                  <ActionableAlert
                    severity="info"
                    icon={<span>🚀</span>}
                    title={format(
                      sig.stagesReadyToAdvance.length > 1
                        ? tx.stagesReadyTitle_other
                        : tx.stagesReadyTitle_one,
                      { count: sig.stagesReadyToAdvance.length }
                    )}
                    message={sig.stagesReadyToAdvance
                      .map((s) => s.stageName)
                      .join(', ')}
                    cta={{
                      label: tx.phasesTitle,
                      href: `/admin/tournament/${tournamentId}/stages`,
                    }}
                  />
                )}
                {sig.pendingTeamsCount > 0 && (
                  <ActionableAlert
                    severity="info"
                    icon={<span>📋</span>}
                    title={format(
                      sig.pendingTeamsCount > 1
                        ? tx.pendingTeamsTitle_other
                        : tx.pendingTeamsTitle_one,
                      { count: sig.pendingTeamsCount }
                    )}
                    cta={{
                      label: tx.teams,
                      href: `/admin/tournament/${tournamentId}`,
                    }}
                  />
                )}
                {sig.activeMvpPolls > 0 && (
                  <ActionableAlert
                    severity="info"
                    icon={<span>🏅</span>}
                    title={format(
                      sig.activeMvpPolls > 1 ? tx.mvpTitle_other : tx.mvpTitle_one,
                      { count: sig.activeMvpPolls }
                    )}
                    message={tx.mvpMsg}
                    cta={{
                      label: tx.matches,
                      href: `/admin/tournament/${tournamentId}/matches?status=finished`,
                    }}
                  />
                )}
                {sig.cronCheckin.isStale && (
                  <ActionableAlert
                    severity="critical"
                    icon={<span>⏰</span>}
                    title={tx.cronDownTitle}
                    message={
                      sig.cronCheckin.lastRunAt
                        ? format(tx.cronDownMsgWithTime, {
                            minutes: sig.cronCheckin.minutesSince ?? 0,
                          })
                        : tx.cronDownMsgNever
                    }
                    cta={{
                      label: tx.checkin,
                      href: `/admin/tournament/${tournamentId}/checkin`,
                    }}
                  />
                )}
                {sig.discordHealth.missingExpectedCount > 0 && (
                  <ActionableAlert
                    severity="warning"
                    icon={<span>🔔</span>}
                    title={format(
                      sig.discordHealth.missingExpectedCount > 1
                        ? tx.discordMissingTitle_other
                        : tx.discordMissingTitle_one,
                      { count: sig.discordHealth.missingExpectedCount }
                    )}
                    message={tx.discordMissingMsg}
                    cta={{
                      label: tx.discord,
                      href: `/admin/tournament/${tournamentId}/discord`,
                    }}
                  />
                )}
                {/* Alertes "génériques" héritées de l'ancien dashboard */}
                {data.alerts.map((a, i) => (
                  <ActionableAlert
                    key={i}
                    severity={
                      a.type === 'error'
                        ? 'error'
                        : a.type === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                    icon={
                      <span>
                        {a.type === 'error'
                          ? '❗'
                          : a.type === 'warning'
                            ? '⚠️'
                            : 'ℹ️'}
                      </span>
                    }
                    title={a.message}
                  />
                ))}
              </div>

              {/* ─── Status workflow ────────────────────────────────── */}
              <WidgetCard title={tx.workflowTitle} className="mb-6">
                <div className="flex flex-wrap items-center gap-2">
                  {data.guards.guards.map((g, i) => {
                    const isCurrent = g.status === data.guards.current_status;
                    return (
                      <div key={g.status} className="flex items-center gap-2">
                        <div
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                            isCurrent
                              ? (STATUS_PILL_STYLE[g.status] ??
                                STATUS_PILL_STYLE.draft)
                              : g.allowed
                                ? 'border-white/10 text-gray-300'
                                : 'border-red-500/20 text-red-400/70'
                          }`}
                          title={g.reason}
                        >
                          {isCurrent && '● '}
                          {g.label}
                          {!g.allowed && !isCurrent && (
                            <span className="text-red-400">🔒</span>
                          )}
                        </div>
                        {i < data.guards.guards.length - 1 && (
                          <span className="text-gray-600">→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {data.guards.guards
                  .filter((g) => !g.allowed && g.reason)
                  .map((g) => (
                    <p
                      key={g.status}
                      className="mt-2 text-[11px] text-red-300/80"
                    >
                      {format(tx.workflowBlocked, {
                        label: g.label,
                        reason: g.reason ?? '',
                      })}
                    </p>
                  ))}
              </WidgetCard>

              {/* ─── Main grid (2 colonnes desktop) ──────────────────── */}
              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* COLONNE GAUCHE */}
                <div className="space-y-6">
                  <WidgetCard
                    title={tx.phasesTitle}
                    badge={`${data.stages.length}`}
                    ctaHref={`/admin/tournament/${tournamentId}/stages`}
                    ctaLabel={tx.manage}
                  >
                    {data.stages.length === 0 ? (
                      <p className="text-sm text-gray-500">{tx.noStages}</p>
                    ) : (
                      <div className="space-y-2.5">
                        {data.stages.map((st) => (
                          <StageProgressBar
                            key={st.id}
                            stageId={st.id}
                            tournamentId={tournamentId!}
                            name={st.name}
                            stageType={st.stage_type}
                            totalMatches={st.totalMatches}
                            finishedMatches={st.finishedMatches}
                            pendingMatches={st.pendingMatches}
                            ongoingMatches={st.ongoingMatches}
                            isActive={st.is_active}
                            teamsCount={st.teamsCount}
                            hourlyBuckets={st.hourlyBuckets}
                            isReadyToAdvance={readyStageIds.has(st.id)}
                            onAdvance={
                              readyStageIds.has(st.id)
                                ? () =>
                                    setAdvanceTarget({
                                      stageId: st.id,
                                      stageName: st.name,
                                    })
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title={tx.teamsTitle}
                    ctaHref={`/admin/tournament/${tournamentId}`}
                    ctaLabel={tx.manage}
                  >
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-300">
                          {s.activeTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsActive}
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-gray-300">
                          {s.eliminatedTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsEliminated}
                        </div>
                      </div>
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-amber-300">
                          {sig.pendingTeamsCount}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsPending}
                        </div>
                      </div>
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-blue-300">
                          {s.totalTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          {tx.teamsTotal}
                        </div>
                      </div>
                    </div>
                  </WidgetCard>

                  <WidgetCard
                    title={tx.checkinTitle}
                    ctaHref={`/admin/tournament/${tournamentId}/checkin`}
                    ctaLabel={tx.detail}
                  >
                    {sig.checkinNext24h.upcoming === 0 ? (
                      <p className="text-sm text-gray-500">{tx.noMatchIn24h}</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-emerald-300">
                            ✅ {sig.checkinNext24h.bothCheckedIn}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinOk}
                          </div>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-amber-300">
                            ⏳ {sig.checkinNext24h.oneSide}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinPartial}
                          </div>
                        </div>
                        <div className="rounded-lg bg-red-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-red-300">
                            ❌ {sig.checkinNext24h.missing}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinNone}
                          </div>
                        </div>
                        <div className="rounded-lg bg-neutral-700/30 p-3 text-center">
                          <div className="text-xl font-bold text-neutral-300">
                            🚷 {sig.checkinNext24h.forfeited}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            {tx.checkinForfeit}
                          </div>
                        </div>
                      </div>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title={tx.recentActivityTitle}
                    badge={sig.recentActivity.length}
                    ctaHref={`/admin/tournament/${tournamentId}/history`}
                    ctaLabel={tx.allHistory}
                  >
                    {sig.recentActivity.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {tx.noStaffAction}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sig.recentActivity.map((row) => {
                          const ageMs =
                            nowMs - new Date(row.createdAt).getTime();
                          const ageLabel =
                            ageMs < 60_000
                              ? tx.ageNow
                              : ageMs < 3_600_000
                                ? format(tx.ageMinutes, {
                                    n: Math.floor(ageMs / 60_000),
                                  })
                                : ageMs < 86_400_000
                                  ? format(tx.ageHours, {
                                      n: Math.floor(ageMs / 3_600_000),
                                    })
                                  : format(tx.ageDays, {
                                      n: Math.floor(ageMs / 86_400_000),
                                    });
                          return (
                            <li
                              key={row.id}
                              className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-white">
                                  <span className="font-medium text-purple-300">
                                    {row.staffName ?? tx.defaultStaffName}
                                  </span>
                                  <span className="mx-1.5 text-gray-500">
                                    ·
                                  </span>
                                  <span>{row.readableAction}</span>
                                  {row.entityType && (
                                    <span className="ml-1.5 text-gray-500">
                                      ({row.entityType}
                                      {row.entityId
                                        ? ` ${row.entityId.slice(0, 8)}`
                                        : ''}
                                      )
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="shrink-0 text-[10px] text-gray-500">
                                {ageLabel}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title={tx.supportTicketsTitle}
                    badge={
                      sig.tickets.totalOpen > 0
                        ? sig.tickets.totalOpen
                        : undefined
                    }
                    ctaHref={`/admin/support?tournament_id=${tournamentId}&status=open`}
                    ctaLabel={tx.open}
                  >
                    <SupportTicketsDonut tickets={sig.tickets} />
                  </WidgetCard>

                  <WidgetCard
                    title={tx.webhooksTitle}
                    badge={
                      sig.discordHealth.configuredCount > 0
                        ? `${sig.discordHealth.configuredCount}/${sig.discordHealth.channels.length}`
                        : undefined
                    }
                    ctaHref={`/admin/tournament/${tournamentId}/discord`}
                    ctaLabel={tx.configure}
                  >
                    <DiscordHealthGrid
                      health={sig.discordHealth}
                      nowMs={nowMs}
                    />
                  </WidgetCard>

                  <WidgetCard
                    title={tx.cronTitle}
                    badge={
                      sig.cronCheckin.isStale
                        ? '⚠'
                        : sig.cronCheckin.lastRunAt
                          ? 'OK'
                          : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p
                          className={`text-sm font-semibold ${
                            sig.cronCheckin.isStale
                              ? 'text-red-300'
                              : sig.cronCheckin.lastRunAt
                                ? 'text-emerald-300'
                                : 'text-gray-400'
                          }`}
                        >
                          {sig.cronCheckin.lastRunAt
                            ? sig.cronCheckin.minutesSince === 0
                              ? tx.cronNow
                              : sig.cronCheckin.minutesSince! < 60
                                ? format(tx.ageMinutes, {
                                    n: sig.cronCheckin.minutesSince ?? 0,
                                  })
                                : format(tx.ageHours, {
                                    n: Math.floor(
                                      sig.cronCheckin.minutesSince! / 60
                                    ),
                                  })
                            : tx.cronNever}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-500">
                          {sig.cronCheckin.isStale
                            ? tx.cronStaleHint
                            : tx.cronOkHint}
                        </p>
                      </div>
                      {sig.cronCheckin.lastRunAt && (
                        <span className="text-[10px] text-gray-500 tabular-nums">
                          {new Date(
                            sig.cronCheckin.lastRunAt
                          ).toLocaleTimeString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </WidgetCard>
                </div>

                {/* COLONNE DROITE */}
                <div className="space-y-6">
                  {sig.liveMatches.length > 0 && (
                    <WidgetCard
                      title={tx.liveTitle}
                      badge={
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                          {sig.liveMatches.length}
                        </span>
                      }
                    >
                      <div className="space-y-2">
                        {sig.liveMatches.slice(0, 5).map((m) => (
                          <UpcomingMatchRow
                            key={m.id}
                            matchId={m.id}
                            team1Name={m.team1Name}
                            team2Name={m.team2Name}
                            scheduledAt={m.scheduledAt}
                            team1Score={m.team1Score}
                            team2Score={m.team2Score}
                            streamUrl={m.streamUrl}
                            roundName={m.roundName}
                            stageName={m.stageName}
                            variant="live"
                            currentMap={m.currentMap}
                            matchFormat={m.matchFormat}
                            onScoreClick={() =>
                              setScoreTarget({
                                id: m.id,
                                team1Name: m.team1Name,
                                team2Name: m.team2Name,
                                team1Score: m.team1Score,
                                team2Score: m.team2Score,
                                matchFormat: m.matchFormat,
                              })
                            }
                          />
                        ))}
                      </div>
                    </WidgetCard>
                  )}

                  <WidgetCard
                    title={tx.upcomingTitle}
                    badge={data.upcomingMatches.length}
                    ctaHref={`/admin/tournament/${tournamentId}/matches?status=pending`}
                    ctaLabel={tx.seeAll}
                  >
                    {data.upcomingMatches.length === 0 ? (
                      <p className="text-sm text-gray-500">{tx.noUpcoming}</p>
                    ) : (
                      <div className="space-y-2">
                        {data.upcomingMatches.slice(0, 8).map((m) => (
                          <UpcomingMatchRow
                            key={m.id}
                            matchId={m.id}
                            team1Name={m.team1_name}
                            team2Name={m.team2_name}
                            scheduledAt={m.scheduled_at}
                            streamUrl={m.stream_url}
                            roundName={m.round_name}
                            stageName={m.stage_name}
                            onScoreClick={() =>
                              setScoreTarget({
                                id: m.id,
                                team1Name: m.team1_name,
                                team2Name: m.team2_name,
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </WidgetCard>

                  {sig.disputesOpen.count > 0 && (
                    <WidgetCard
                      title={tx.disputesTitle}
                      badge={sig.disputesOpen.count}
                      ctaHref={`/admin/tournament/${tournamentId}/matches?status=disputed`}
                      ctaLabel={tx.allFem}
                    >
                      <div className="space-y-2">
                        {sig.disputesOpen.matches.slice(0, 5).map((m) => (
                          <UpcomingMatchRow
                            key={m.id}
                            matchId={m.id}
                            team1Name={m.team1Name}
                            team2Name={m.team2Name}
                            scheduledAt={m.openedAt}
                            roundName={m.reason ? m.reason.slice(0, 60) : null}
                            variant="dispute"
                            onResolveClick={() =>
                              setDisputeTarget({
                                id: m.id,
                                team1Name: m.team1Name,
                                team2Name: m.team2Name,
                                reason: m.reason,
                              })
                            }
                          />
                        ))}
                      </div>
                    </WidgetCard>
                  )}
                </div>
              </div>

              {/* ─── Quick access grid ──────────────────────────────── */}
              <WidgetCard title={tx.quickAccessTitle}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {QUICK_LINKS.filter((link) =>
                    hasAtLeastRole(
                      staff.role as StaffRole,
                      link.role ?? 'manager'
                    )
                  ).map((link) => (
                    <Link
                      key={link.label}
                      href={link.href(tournamentId!)}
                      className="group rounded-xl border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-purple-500/30 hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{link.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white group-hover:text-purple-200">
                            {link.label}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-gray-500">
                            {link.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </WidgetCard>
            </>
          )}
        </div>
      </div>

      {/* ─── Modales d'actions inline ───────────────────────────────── */}
      <ScoreEntryModal
        key={scoreTarget?.id ?? 'score-modal'}
        open={!!scoreTarget}
        matchId={scoreTarget?.id ?? ''}
        team1Name={scoreTarget?.team1Name ?? null}
        team2Name={scoreTarget?.team2Name ?? null}
        initialTeam1Score={scoreTarget?.team1Score ?? null}
        initialTeam2Score={scoreTarget?.team2Score ?? null}
        matchFormat={scoreTarget?.matchFormat ?? null}
        onClose={() => setScoreTarget(null)}
        onSuccess={fetchDashboard}
      />
      <DisputeResolveModal
        key={disputeTarget?.id ?? 'dispute-modal'}
        open={!!disputeTarget}
        matchId={disputeTarget?.id ?? ''}
        team1Name={disputeTarget?.team1Name ?? null}
        team2Name={disputeTarget?.team2Name ?? null}
        reason={disputeTarget?.reason ?? null}
        initialTeam1Score={disputeTarget?.team1Score ?? null}
        initialTeam2Score={disputeTarget?.team2Score ?? null}
        onClose={() => setDisputeTarget(null)}
        onSuccess={fetchDashboard}
      />
      <ConfirmAdvanceModal
        open={!!advanceTarget}
        stageId={advanceTarget?.stageId ?? ''}
        stageName={advanceTarget?.stageName ?? ''}
        onClose={() => setAdvanceTarget(null)}
        onSuccess={fetchDashboard}
      />
    </>
  );
}

export default MegaDashboardPage;
