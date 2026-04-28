// pages/admin/tournament/[id]/dashboard.tsx
// Mega-dashboard "Centre de contrôle" du tournoi.
// Remplace l'ancienne vue lecture-seule par un hub actionnable :
// KPIs, alertes priorisées, status workflow, phases, équipes,
// matchs en cours / à venir / disputes, check-in du jour, accès rapide aux 15 sous-pages.

import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import { formatDateTimeTz } from '@/utils/timezone';
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

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  running: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

/* -----------------------------------------------------------
 * Quick access grid des 15 sous-pages
 * ---------------------------------------------------------*/

type QuickLink = {
  label: string;
  href: (id: string) => string;
  icon: string;
  description: string;
  role?: 'manager' | 'admin';
};

const QUICK_LINKS: QuickLink[] = [
  {
    label: 'Phases',
    icon: '🧱',
    href: (id) => `/admin/tournament/${id}/stages`,
    description: 'Configurer poules, brackets, swiss',
  },
  {
    label: 'Matchs',
    icon: '🎯',
    href: (id) => `/admin/tournament/${id}/matches`,
    description: 'Liste, filtres, scoring',
  },
  {
    label: 'Bracket',
    icon: '🏆',
    href: (id) => `/admin/tournament/${id}/bracket`,
    description: 'Générer un bracket simple/double',
  },
  {
    label: 'Bracket Builder',
    icon: '🛠️',
    href: (id) => `/admin/tournament/${id}/bracket-builder`,
    description: 'Drag-drop visuel + planning',
  },
  {
    label: 'Maps',
    icon: '🗺️',
    href: (id) => `/admin/tournament/${id}/maps`,
    description: 'Pool de cartes',
  },
  {
    label: 'Map Draw',
    icon: '🎲',
    href: (id) => `/admin/tournament/${id}/map-draw`,
    description: 'Tirage aléatoire BO3/BO5',
  },
  {
    label: 'Veto',
    icon: '🚫',
    href: (id) => `/admin/tournament/${id}/veto`,
    description: 'Pick/ban par match',
  },
  {
    label: 'Check-in',
    icon: '✅',
    href: (id) => `/admin/tournament/${id}/checkin`,
    description: 'État check-in par match',
  },
  {
    label: 'Bulk ops',
    icon: '⚡',
    href: (id) => `/admin/tournament/${id}/bulk-ops`,
    description: 'Décaler / réassigner en masse',
  },
  {
    label: 'Stats',
    icon: '📊',
    href: (id) => `/admin/tournament/${id}/stats`,
    description: 'Winrates, maps, OT',
  },
  {
    label: 'Discord',
    icon: '🔔',
    href: (id) => `/admin/tournament/${id}/discord`,
    description: 'Webhooks par canal',
    role: 'admin',
  },
  {
    label: 'History',
    icon: '📜',
    href: (id) => `/admin/tournament/${id}/history`,
    description: 'Audit log staff',
  },
  {
    label: 'Édition',
    icon: '✏️',
    href: (id) => `/admin/tournament/${id}/edit`,
    description: 'Méta, dates, roster lock',
  },
  {
    label: 'Tickets support',
    icon: '🛂',
    href: () => `/admin/support`,
    description: 'Disputes / signalements',
  },
  {
    label: 'Templates',
    icon: '🧬',
    href: () => `/admin/tournament-templates`,
    description: 'Modèles de tournois',
    role: 'admin',
  },
  {
    label: 'Simulateur',
    icon: '🧪',
    href: () => `/admin/tournament-simulator`,
    description: 'Monte-Carlo & projections',
    role: 'admin',
  },
];

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

function MegaDashboardPage({ initialData, initialError }: Props) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

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
        throw new Error(json.error || 'Impossible de charger le dashboard');
      }
      setData(await res.json());
      setLastFetchedAt(new Date());
      setStale(false);
      setErrorMsg(null);
    } catch (err: unknown) {
      // Garde le snapshot précédent et passe en mode stale.
      setStale(true);
      setErrorMsg((err as Error)?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // Auto-refresh (pause si onglet caché). Pas de fetch initial : SSR a déjà
  // chargé les données via getServerSideProps.
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
    if (diffMs <= 0) return { passed: true, label: 'verrouillé' };
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
    if (diffMs <= 0) return { label: 'imminent', iso: etaIso };
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 1) {
      const minutes = Math.round(diffMs / 60_000);
      return { label: `dans ${minutes} min`, iso: etaIso };
    }
    if (hours < 36) return { label: `dans ${hours}h`, iso: etaIso };
    const days = Math.round(hours / 24);
    return { label: `dans ${days}j`, iso: etaIso };
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
        <title>Centre de contrôle — {t?.name ?? 'Tournoi'}</title>
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
              Retour au tournoi
            </button>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {t?.name ?? 'Chargement…'}
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
                      {sig.liveMatches.length} en direct
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  Centre de contrôle
                  {jDayHeader && (
                    <>
                      {' · '}prochain kickoff dans{' '}
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
                        {stale ? '⚠ stale' : 'à jour'} ·{' '}
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
                    Exporter
                  </button>
                  <div className="invisible absolute right-0 z-10 mt-1 w-48 rounded-xl border border-neutral-700 bg-neutral-800 py-1 shadow-lg group-hover:visible">
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=csv`}
                      className="block px-4 py-2 text-sm transition-colors hover:bg-neutral-700"
                    >
                      Résultats CSV
                    </a>
                    <a
                      href={`/api/admin/tournament/${tournamentId}/export-results?format=json`}
                      className="block px-4 py-2 text-sm transition-colors hover:bg-neutral-700"
                    >
                      Résultats JSON
                    </a>
                  </div>
                </div>
                <button
                  onClick={fetchDashboard}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-700"
                >
                  Rafraîchir
                </button>
              </div>
            </div>
          </div>

          {/* ─── Loading / error initial ────────────────────────────── */}
          {loading && !data && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400">
              Chargement du dashboard…
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
                  label="Équipes"
                  value={`${s.activeTeams}/${s.totalTeams}`}
                  hint={`${s.eliminatedTeams} éliminée(s)`}
                  accent="pink"
                />
                <StatCard
                  label="Matchs"
                  value={`${s.finishedMatches}/${s.totalMatches}`}
                  hint={`${s.completionPercent}% terminé`}
                  accent="emerald"
                />
                <StatCard
                  label="En cours"
                  value={s.ongoingMatches}
                  hint={s.ongoingMatches > 0 ? 'Live' : '—'}
                  accent={s.ongoingMatches > 0 ? 'red' : 'gray'}
                />
                <StatCard
                  label="Phases"
                  value={data.stages.length}
                  hint={
                    data.stages.find((st) => st.is_active)?.name ??
                    'Aucune active'
                  }
                  accent="blue"
                />
                <StatCard
                  label="Cadence"
                  value={
                    sig.velocity.matchesPerHour > 0
                      ? `${sig.velocity.matchesPerHour}/h`
                      : '—'
                  }
                  hint={
                    sig.velocity.finishedInWindow > 0
                      ? `${sig.velocity.finishedInWindow} finis sur ${sig.velocity.windowHours}h`
                      : "Pas d'activité récente"
                  }
                  accent={sig.velocity.matchesPerHour > 0 ? 'emerald' : 'gray'}
                />
                <StatCard
                  label="ETA fin"
                  value={
                    liveEta?.label ??
                    (sig.velocity.remainingMatches === 0 ? 'Terminé' : '—')
                  }
                  hint={
                    liveEta?.iso
                      ? formatDateTimeTz(liveEta.iso, t.timezone, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : sig.velocity.remainingMatches === 0
                        ? 'Tous les matchs sont joués'
                        : 'Cadence trop faible pour estimer'
                  }
                  accent={liveEta ? 'purple' : 'gray'}
                />
                <StatCard
                  label="Démarrage"
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
                    title={`${sig.disputesOpen.count} dispute${sig.disputesOpen.count > 1 ? 's' : ''} ouverte${sig.disputesOpen.count > 1 ? 's' : ''}`}
                    message="La propagation du bracket est bloquée tant qu'elles ne sont pas résolues."
                    cta={{
                      label: 'Résoudre',
                      href: `/admin/tournament/${tournamentId}/matches?status=disputed`,
                    }}
                  />
                )}
                {sig.conflictsCount > 0 && (
                  <div className="group relative">
                    <ActionableAlert
                      severity="warning"
                      icon={<span>🚨</span>}
                      title={`${sig.conflictsCount} conflit${sig.conflictsCount > 1 ? 's' : ''} de planning`}
                      message="Survolez pour voir le détail. Une équipe est planifiée sur deux matchs qui se chevauchent."
                      cta={{
                        label: 'Voir',
                        href: `/admin/tournament/${tournamentId}`,
                      }}
                    />
                    {sig.conflictsList.length > 0 && (
                      <div className="invisible absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-amber-500/30 bg-neutral-900/98 p-3 shadow-2xl backdrop-blur-sm group-hover:visible">
                        <p className="mb-2 text-[10px] uppercase tracking-widest text-amber-300">
                          Détail{' '}
                          {sig.conflictsCount > sig.conflictsList.length
                            ? `(${sig.conflictsList.length} sur ${sig.conflictsCount})`
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
                                  : match {fmtTime(c.matchAScheduledAt)}
                                  {' ↔ '}
                                  {fmtTime(c.matchBScheduledAt)}
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
                      title={`${sig.checkinNext24h.missing} équipe${sig.checkinNext24h.missing > 1 ? 's' : ''} pas encore check-in`}
                      message={`Sur les ${sig.checkinNext24h.upcoming} match(s) à venir dans les 24h.`}
                      cta={{
                        label: 'Check-in',
                        href: `/admin/tournament/${tournamentId}/checkin`,
                      }}
                    />
                  )}
                {sig.supportHighOpen > 0 && (
                  <ActionableAlert
                    severity="critical"
                    icon={<span>🛂</span>}
                    title={`${sig.supportHighOpen} ticket${sig.supportHighOpen > 1 ? 's' : ''} critique${sig.supportHighOpen > 1 ? 's' : ''} non résolu${sig.supportHighOpen > 1 ? 's' : ''}`}
                    message="Sévérité haute. À traiter en priorité."
                    cta={{ label: 'Ouvrir', href: '/admin/support' }}
                  />
                )}
                {liveRosterLock &&
                  !liveRosterLock.passed &&
                  sig.rosterLockProximity.hoursLeft !== null &&
                  sig.rosterLockProximity.hoursLeft <= 24 && (
                    <ActionableAlert
                      severity="warning"
                      icon={<span>🔒</span>}
                      title={`Roster lock dans ${liveRosterLock.label}`}
                      message={
                        sig.rosterLockProximity.teamsBelowMin > 0
                          ? `${sig.rosterLockProximity.teamsBelowMin} équipe(s) sous le minimum de joueurs.`
                          : 'Vérifiez les rosters avant verrouillage.'
                      }
                      cta={{
                        label: 'Édition',
                        href: `/admin/tournament/${tournamentId}/edit`,
                      }}
                    />
                  )}
                {sig.stagesReadyToAdvance.length > 0 && (
                  <ActionableAlert
                    severity="info"
                    icon={<span>🚀</span>}
                    title={`${sig.stagesReadyToAdvance.length} phase${sig.stagesReadyToAdvance.length > 1 ? 's' : ''} prête${sig.stagesReadyToAdvance.length > 1 ? 's' : ''} à advance`}
                    message={sig.stagesReadyToAdvance
                      .map((s) => s.stageName)
                      .join(', ')}
                    cta={{
                      label: 'Phases',
                      href: `/admin/tournament/${tournamentId}/stages`,
                    }}
                  />
                )}
                {sig.pendingTeamsCount > 0 && (
                  <ActionableAlert
                    severity="info"
                    icon={<span>📋</span>}
                    title={`${sig.pendingTeamsCount} inscription${sig.pendingTeamsCount > 1 ? 's' : ''} en attente`}
                    cta={{
                      label: 'Équipes',
                      href: `/admin/tournament/${tournamentId}`,
                    }}
                  />
                )}
                {sig.activeMvpPolls > 0 && (
                  <ActionableAlert
                    severity="info"
                    icon={<span>🏅</span>}
                    title={`${sig.activeMvpPolls} sondage${sig.activeMvpPolls > 1 ? 's' : ''} MVP actif${sig.activeMvpPolls > 1 ? 's' : ''}`}
                    message="Importer le vainqueur après la fermeture côté Discord."
                    cta={{
                      label: 'Matchs',
                      href: `/admin/tournament/${tournamentId}/matches?status=finished`,
                    }}
                  />
                )}
                {sig.cronCheckin.isStale && (
                  <ActionableAlert
                    severity="critical"
                    icon={<span>⏰</span>}
                    title="Cron check-in en panne"
                    message={
                      sig.cronCheckin.lastRunAt
                        ? `Dernier passage il y a ${sig.cronCheckin.minutesSince} min. Les rappels et auto-forfaits ne tournent plus.`
                        : "Le cron n'a jamais pu écrire de heartbeat. Vérifie la configuration Netlify Scheduled Functions et CRON_SECRET."
                    }
                    cta={{
                      label: 'Check-in',
                      href: `/admin/tournament/${tournamentId}/checkin`,
                    }}
                  />
                )}
                {sig.discordHealth.missingExpectedCount > 0 && (
                  <ActionableAlert
                    severity="warning"
                    icon={<span>🔔</span>}
                    title={`${sig.discordHealth.missingExpectedCount} canal/canaux Discord manquant${sig.discordHealth.missingExpectedCount > 1 ? 's' : ''}`}
                    message="Au moins un canal sans webhook actif alors qu'on attend du trafic dessus."
                    cta={{
                      label: 'Discord',
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
              <WidgetCard title="Workflow de statut" className="mb-6">
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
                      {g.label} bloqué : {g.reason}
                    </p>
                  ))}
              </WidgetCard>

              {/* ─── Main grid (2 colonnes desktop) ──────────────────── */}
              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* COLONNE GAUCHE */}
                <div className="space-y-6">
                  <WidgetCard
                    title="Phases"
                    badge={`${data.stages.length}`}
                    ctaHref={`/admin/tournament/${tournamentId}/stages`}
                    ctaLabel="Gérer"
                  >
                    {data.stages.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Aucune phase configurée.
                      </p>
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
                    title="Équipes"
                    ctaHref={`/admin/tournament/${tournamentId}`}
                    ctaLabel="Gérer"
                  >
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-300">
                          {s.activeTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          Actives
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-gray-300">
                          {s.eliminatedTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          Éliminées
                        </div>
                      </div>
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-amber-300">
                          {sig.pendingTeamsCount}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          En attente
                        </div>
                      </div>
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                        <div className="text-2xl font-bold text-blue-300">
                          {s.totalTeams}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          Total
                        </div>
                      </div>
                    </div>
                  </WidgetCard>

                  <WidgetCard
                    title="Check-in (24 h)"
                    ctaHref={`/admin/tournament/${tournamentId}/checkin`}
                    ctaLabel="Détail"
                  >
                    {sig.checkinNext24h.upcoming === 0 ? (
                      <p className="text-sm text-gray-500">
                        Pas de match planifié dans les 24h.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-emerald-300">
                            ✅ {sig.checkinNext24h.bothCheckedIn}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            OK
                          </div>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-amber-300">
                            ⏳ {sig.checkinNext24h.oneSide}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            Partiel
                          </div>
                        </div>
                        <div className="rounded-lg bg-red-500/10 p-3 text-center">
                          <div className="text-xl font-bold text-red-300">
                            ❌ {sig.checkinNext24h.missing}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            Aucun
                          </div>
                        </div>
                        <div className="rounded-lg bg-neutral-700/30 p-3 text-center">
                          <div className="text-xl font-bold text-neutral-300">
                            🚷 {sig.checkinNext24h.forfeited}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-400">
                            Forfait
                          </div>
                        </div>
                      </div>
                    )}
                  </WidgetCard>

                  <WidgetCard
                    title="Activité staff récente"
                    badge={sig.recentActivity.length}
                    ctaHref={`/admin/tournament/${tournamentId}/history`}
                    ctaLabel="Tout l'historique"
                  >
                    {sig.recentActivity.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Aucune action staff sur ce tournoi.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sig.recentActivity.map((row) => {
                          const ageMs =
                            nowMs - new Date(row.createdAt).getTime();
                          const ageLabel =
                            ageMs < 60_000
                              ? "à l'instant"
                              : ageMs < 3_600_000
                                ? `il y a ${Math.floor(ageMs / 60_000)} min`
                                : ageMs < 86_400_000
                                  ? `il y a ${Math.floor(ageMs / 3_600_000)}h`
                                  : `il y a ${Math.floor(ageMs / 86_400_000)}j`;
                          return (
                            <li
                              key={row.id}
                              className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-white">
                                  <span className="font-medium text-purple-300">
                                    {row.staffName ?? 'Staff'}
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
                    title="Tickets support"
                    badge={
                      sig.tickets.totalOpen > 0
                        ? sig.tickets.totalOpen
                        : undefined
                    }
                    ctaHref={`/admin/support?tournament_id=${tournamentId}&status=open`}
                    ctaLabel="Ouvrir"
                  >
                    <SupportTicketsDonut tickets={sig.tickets} />
                  </WidgetCard>

                  <WidgetCard
                    title="Webhooks Discord"
                    badge={
                      sig.discordHealth.configuredCount > 0
                        ? `${sig.discordHealth.configuredCount}/${sig.discordHealth.channels.length}`
                        : undefined
                    }
                    ctaHref={`/admin/tournament/${tournamentId}/discord`}
                    ctaLabel="Configurer"
                  >
                    <DiscordHealthGrid
                      health={sig.discordHealth}
                      nowMs={nowMs}
                    />
                  </WidgetCard>

                  <WidgetCard
                    title="Cron check-in"
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
                              ? "À l'instant"
                              : sig.cronCheckin.minutesSince! < 60
                                ? `il y a ${sig.cronCheckin.minutesSince} min`
                                : `il y a ${Math.floor(sig.cronCheckin.minutesSince! / 60)}h`
                            : 'Jamais lancé'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-500">
                          {sig.cronCheckin.isStale
                            ? '> 60 min sans heartbeat — emails / forfaits suspendus'
                            : 'Heartbeat OK (cron toutes les 5 min, seuil 60 min)'}
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
                      title="En direct"
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
                    title="À venir"
                    badge={data.upcomingMatches.length}
                    ctaHref={`/admin/tournament/${tournamentId}/matches?status=pending`}
                    ctaLabel="Tout voir"
                  >
                    {data.upcomingMatches.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Aucun match à venir.
                      </p>
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
                      title="Disputes ouvertes"
                      badge={sig.disputesOpen.count}
                      ctaHref={`/admin/tournament/${tournamentId}/matches?status=disputed`}
                      ctaLabel="Toutes"
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
              <WidgetCard title="Accès rapide">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {QUICK_LINKS.map((link) => (
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
