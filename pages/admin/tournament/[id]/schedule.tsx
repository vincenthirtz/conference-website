// pages/admin/tournament/[id]/schedule.tsx
//
// Diagnostic de planning — lot 3 de docs/PLAN-plateforme-tournois.md.
//
// L'écran qui remplace la simulation faite à la main : il pose au calendrier
// les quatre questions qu'on se posait en rejouant six scénarios en HTML —
// une contrainte d'équipe est-elle violée, une équipe joue-t-elle deux fois,
// un match sort-il des dates, un créneau porte-t-il plus que la production.
//
// Lecture seule. Quand la correction est triviale (un créneau libre le même
// soir qui satisfait les deux équipes), elle est AFFICHÉE ; l'appliquer d'un
// geste est le lot 5, parce qu'un déplacement mérite d'abord son aperçu
// d'impact.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import nsAdminTournamentSchedule from '@/lib/i18n/locales/admin-fr/adminTournamentSchedule';
import ScheduleMonthCalendar, {
  type CalendarMatch,
} from '@/components/admin/tournament/ScheduleMonthCalendar';
import type { AvailabilityConstraint } from '@/utils/matches/availability';
import type {
  ScheduleAnomaly,
  ScheduleAnomalyKind,
  ScheduleAnomalySeverity,
} from '@/utils/matches/scheduleDiagnostics';

type DiagnosticsResponse = {
  tournament: {
    id: string;
    name: string | null;
    startDate: string | null;
    endDate: string | null;
    timezone: string;
  };
  counts: Record<ScheduleAnomalySeverity, number>;
  anomalies: ScheduleAnomaly[];
  slotGrid: string[];
  constraintCount: number;
  matchCount: number;
  matches: CalendarMatch[];
  constraints: AvailabilityConstraint[];
  teamNames: Record<string, string>;
};

const SEVERITIES: ScheduleAnomalySeverity[] = ['blocking', 'warning', 'info'];

const SEVERITY_STYLE: Record<ScheduleAnomalySeverity, string> = {
  blocking: 'border-red-500/40 bg-red-500/10',
  warning: 'border-amber-500/40 bg-amber-500/10',
  info: 'border-neutral-700 bg-neutral-800/60',
};

const SEVERITY_DOT: Record<ScheduleAnomalySeverity, string> = {
  blocking: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-neutral-500',
};

export const getServerSideProps = withStaffPage(
  { permission: 'manage_tournaments' },
  async () => ({})
);

export default function TournamentSchedulePage() {
  const t = useAdminT(nsAdminTournamentSchedule);
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState(30);
  const [concurrent, setConcurrent] = useState(1);
  const [view, setView] = useState<'list' | 'month'>('month');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const json = await adminFetchJson<DiagnosticsResponse>(
        `/api/admin/tournament/${id}/schedule-diagnostics?rest=${rest}&concurrent=${concurrent}`
      );
      setData(json);
      setError(null);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, id, rest, concurrent, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * La gravité la plus haute retenue contre chaque match. Le calendrier n'a pas
   * la place d'afficher trois anomalies dans une case de 72 px : il montre la
   * pire, la liste détaille.
   */
  const severityByMatch = useMemo(() => {
    const rank: Record<ScheduleAnomalySeverity, number> = {
      blocking: 0,
      warning: 1,
      info: 2,
    };
    const out: Record<string, ScheduleAnomalySeverity> = {};
    for (const a of data?.anomalies ?? []) {
      for (const id of a.matchIds) {
        const current = out[id];
        if (!current || rank[a.severity] < rank[current]) out[id] = a.severity;
      }
    }
    return out;
  }, [data]);

  const kindLabel = (k: ScheduleAnomalyKind): string =>
    ({
      availability: t.kindAvailability,
      double_booking: t.kindDoubleBooking,
      same_evening: t.kindSameEvening,
      outside_tournament: t.kindOutsideTournament,
      slot_collision: t.kindSlotCollision,
      unscheduled: t.kindUnscheduled,
    })[k];

  const severityLabel = (s: ScheduleAnomalySeverity): string =>
    s === 'blocking' ? t.blocking : s === 'warning' ? t.warning : t.info;

  /** Instant → « ven. 18 sept., 20:30 » dans le fuseau du tournoi. */
  const when = (iso: string | null): string => {
    if (!iso || !data) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: data.tournament.timezone,
      });
    } catch {
      return iso;
    }
  };

  const total = data ? data.anomalies.length : 0;

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto max-w-[1200px] px-4 pb-14 pt-20 sm:px-6 lg:px-8">
          {id && (
            <TournamentTabsNav tournamentId={String(id)} active="schedule" />
          )}

          <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-400">
                {t.eyebrow}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                {data?.tournament.name ?? t.pageTitle}
              </h1>
              <p className="mt-1 max-w-prose text-sm text-neutral-400">
                {t.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div
                role="group"
                aria-label={t.viewLabel}
                className="inline-flex rounded-lg border border-neutral-700 bg-neutral-800 p-0.5"
              >
                {(['month', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === v
                        ? 'bg-neutral-700 text-white'
                        : 'text-neutral-400'
                    }`}
                  >
                    {v === 'month' ? t.viewMonth : t.viewList}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-neutral-600 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
              >
                {t.refresh}
              </button>
            </div>
          </div>

          {/* Réglages : ils changent la LECTURE du calendrier, jamais le calendrier. */}
          <section className="mb-6 rounded-xl border border-neutral-700 bg-neutral-800/60 p-4">
            <p className="mb-3 text-xs uppercase tracking-[0.12em] text-neutral-400">
              {t.settings}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm text-neutral-300">{t.restLabel}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={240}
                    step={5}
                    value={rest}
                    onChange={(e) => setRest(Number(e.target.value) || 0)}
                    className="w-24 rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm"
                  />
                  <span className="text-xs text-neutral-500">{t.restUnit}</span>
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-neutral-300">
                  {t.concurrentLabel}
                </span>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={concurrent}
                  onChange={(e) => setConcurrent(Number(e.target.value) || 1)}
                  className="w-24 rounded-lg border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-neutral-500">{t.settingsHint}</p>
          </section>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          )}

          {loading && !data ? (
            <p className="text-sm text-neutral-300">{t.loading}</p>
          ) : data ? (
            <>
              <div className="mb-6 flex flex-wrap gap-3">
                {SEVERITIES.map((s) => (
                  <div
                    key={s}
                    className={`flex-1 min-w-[150px] rounded-xl border px-4 py-3 ${SEVERITY_STYLE[s]}`}
                  >
                    <p className="text-2xl font-bold tabular-nums">
                      {data.counts[s]}
                    </p>
                    <p className="text-sm text-neutral-300">
                      {severityLabel(s)}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mb-4 text-xs text-neutral-500">
                {format(t.countMatches, { count: data.matchCount })} ·{' '}
                {format(t.countConstraints, { count: data.constraintCount })}
                {data.slotGrid.length > 0 && (
                  <>
                    {' · '}
                    {format(t.slotGrid, { slots: data.slotGrid.join(' · ') })}
                  </>
                )}
              </p>

              {data.constraintCount === 0 && (
                <p className="mb-6 rounded-xl border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-neutral-300">
                  {t.noConstraints}
                </p>
              )}

              {view === 'month' && (
                <div className="mb-6 rounded-xl border border-neutral-700 bg-neutral-900/40 p-3">
                  <ScheduleMonthCalendar
                    matches={data.matches}
                    severityByMatch={severityByMatch}
                    constraints={data.constraints}
                    teamNames={data.teamNames}
                    timezone={data.tournament.timezone}
                    labels={{
                      prevMonth: t.prevMonth,
                      nextMonth: t.nextMonth,
                      blockedDay: t.blockedDay,
                      legendBlocking: t.legendBlocking,
                      legendWarning: t.legendWarning,
                      legendOk: t.legendOk,
                      legendBlocked: t.legendBlocked,
                      empty: t.calendarEmpty,
                    }}
                  />
                </div>
              )}

              {total === 0 ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5">
                  <p className="font-semibold text-emerald-200">{t.allGood}</p>
                  <p className="mt-1 text-sm text-neutral-300">
                    {t.allGoodHint}
                  </p>
                </div>
              ) : (
                // Le détail des anomalies ne s'affiche qu'en vue liste : dans une
                // case de calendrier, une anomalie tient en une couleur, pas en
                // une phrase. Les deux vues lisent le même diagnostic.
                view === 'list' && (
                <ul className="space-y-2">
                  {data.anomalies.map((a, i) => (
                    <li
                      key={`${a.kind}-${a.matchIds.join('-')}-${i}`}
                      className={`rounded-xl border px-4 py-3 ${SEVERITY_STYLE[a.severity]}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`}
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="text-xs uppercase tracking-[0.1em] text-neutral-400">
                            {kindLabel(a.kind)}
                            {a.at && <> · {when(a.at)}</>}
                          </p>
                          <p className="text-sm text-neutral-100">{a.message}</p>

                          {a.suggestion && (
                            <p className="text-sm text-emerald-200">
                              <span className="text-xs uppercase tracking-[0.1em] text-emerald-300/80">
                                {t.suggestionLabel}
                              </span>{' '}
                              —{' '}
                              {format(t.suggestionMove, {
                                time: when(a.suggestion.moveTo),
                              })}
                              . <span className="text-neutral-300">{a.suggestion.why}</span>
                            </p>
                          )}

                          <p className="flex flex-wrap gap-3 pt-1">
                            {a.matchIds.map((matchId) => (
                              <Link
                                key={matchId}
                                href={`/admin/matches/${matchId}`}
                                className="text-xs underline text-neutral-300"
                              >
                                {t.openMatch}
                              </Link>
                            ))}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                )
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
