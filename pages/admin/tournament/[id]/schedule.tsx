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
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import nsAdminTournamentSchedule from '@/lib/i18n/locales/admin-fr/adminTournamentSchedule';
import ScheduleMonthCalendar, {
  type CalendarMatch,
} from '@/components/admin/tournament/ScheduleMonthCalendar';
import type { AvailabilityConstraint } from '@/utils/matches/availability';
import type {
  MoveImpact,
  ScheduleAnomaly,
  ScheduleAnomalyKind,
  ScheduleAnomalySeverity,
  ScheduleSuggestion,
} from '@/utils/matches/scheduleDiagnostics';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import StatTile, { type StatTone } from '@/features/admin/_shared/ui/StatTile';

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
  blocking: 'border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)]',
  warning: 'border-[rgba(245,165,36,.4)] bg-[rgba(245,165,36,.08)]',
  info: 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]',
};

const SEVERITY_DOT: Record<ScheduleAnomalySeverity, string> = {
  blocking: 'bg-[var(--err,#ff6b6b)]',
  warning: 'bg-[var(--warn,#f5a524)]',
  info: 'bg-[var(--t4,#807984)]',
};

/** Tonalité de la tuile de décompte : la couleur ne s'allume que s'il y a lieu. */
const SEVERITY_TONE: Record<ScheduleAnomalySeverity, StatTone> = {
  blocking: 'err',
  warning: 'warn',
  info: 'neutral',
};

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const INPUT =
  'w-24 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 font-mono text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

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
  const [movingId, setMovingId] = useState<string | null>(null);
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

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

  /**
   * Appliquer une correction proposée : l'aperçu D'ABORD, l'écriture ensuite.
   *
   * Deux appels au même endpoint, `apply: false` puis `apply: true`. Le premier
   * rejoue tout le calendrier sans rien écrire et rend ce que le déplacement
   * répare et ce qu'il casse ; c'est ce qu'on met sous les yeux avant de
   * demander confirmation. Le serveur refuse de lui-même une écriture qui
   * créerait une anomalie bloquante — l'écran ne peut pas contourner ce
   * garde-fou en oubliant de regarder.
   */
  async function applySuggestion(
    suggestion: ScheduleSuggestion,
    label: string
  ) {
    if (!id || movingId) return;
    setMovingId(suggestion.matchId);
    try {
      const moves = [
        { matchId: suggestion.matchId, scheduledAt: suggestion.moveTo },
      ];
      const preview = await mutateJson<{ impact: MoveImpact }>(
        `/api/admin/tournament/${id}/schedule-move`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moves, apply: false, rest, concurrent }),
        }
      );

      const impact = preview.impact;
      const ok = await confirm({
        title: t.applyTitle,
        subtitle: format(t.applySubtitle, {
          label,
          time: when(suggestion.moveTo),
        }),
        body: (
          <span className="block space-y-1 text-sm">
            <span className="block text-[var(--lf-200,#b3e7a3)]">
              {format(t.impactFixed, { count: impact.fixed.length })}
            </span>
            <span
              className={`block ${impact.broken.length > 0 ? 'text-[#ffd9a3]' : 'text-[var(--t3,#a39ba6)]'}`}
            >
              {impact.broken.length > 0
                ? format(t.impactBroken, { count: impact.broken.length })
                : t.impactNone}
            </span>
            {impact.broken.map((b, i) => (
              <span
                key={i}
                className="block pl-3 text-xs text-[var(--t3,#a39ba6)]"
              >
                · {b.message}
              </span>
            ))}
            {impact.createsBlocking && (
              <span className="block pt-1 font-semibold text-[#ffc2c2]">
                {t.impactBlocking}
              </span>
            )}
          </span>
        ),
        confirmLabel: t.applyConfirm,
        variant: impact.createsBlocking ? 'danger' : undefined,
      });
      if (!ok) return;

      await mutateJson(`/api/admin/tournament/${id}/schedule-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves, apply: true, rest, concurrent }),
      });
      addToast(t.moveDone, 'success');
      await load();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      addToast(
        code === 'WOULD_CREATE_BLOCKING' ? t.moveRefused : t.moveError,
        'error'
      );
    } finally {
      setMovingId(null);
    }
  }

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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        {id && <TournamentTabsNav tournamentId={String(id)} active="matches" />}

        <p className={EYEBROW}>{t.eyebrow}</p>
        <AdminPageHeader
          title={data?.tournament.name ?? t.pageTitle}
          subtitle={t.subtitle}
          actions={
            <>
              <div
                role="group"
                aria-label={t.viewLabel}
                className="inline-flex h-[38px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-0.5"
              >
                {(['month', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`h-full rounded-[3px] px-3 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] transition-colors ${
                      view === v
                        ? 'bg-[rgba(180,103,209,.18)] text-[var(--or-200,#eec4ff)]'
                        : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
                    }`}
                  >
                    {v === 'month' ? t.viewMonth : t.viewList}
                  </button>
                ))}
              </div>
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => void load()}
                disabled={loading}
              >
                {t.refresh}
              </AdminButton>
            </>
          }
        />

        {/* Réglages : ils changent la LECTURE du calendrier, jamais le calendrier. */}
        <section className={`${CARD} mb-6`}>
          <p className={EYEBROW}>{t.settings}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm text-[var(--t2,#c7bfca)]">
                {t.restLabel}
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={240}
                  step={5}
                  value={rest}
                  onChange={(e) => setRest(Number(e.target.value) || 0)}
                  className={INPUT}
                />
                <span className="text-xs text-[var(--t4,#807984)]">
                  {t.restUnit}
                </span>
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-[var(--t2,#c7bfca)]">
                {t.concurrentLabel}
              </span>
              <input
                type="number"
                min={1}
                max={32}
                value={concurrent}
                onChange={(e) => setConcurrent(Number(e.target.value) || 1)}
                className={`${INPUT} block`}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-[var(--t4,#807984)]">
            {t.settingsHint}
          </p>
        </section>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-3 py-2 text-sm text-[#ffc2c2]"
          >
            {error}
          </p>
        )}

        {loading && !data ? (
          <p className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</p>
        ) : data ? (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {SEVERITIES.map((s) => (
                <StatTile
                  key={s}
                  label={severityLabel(s)}
                  value={data.counts[s]}
                  tone={data.counts[s] > 0 ? SEVERITY_TONE[s] : 'neutral'}
                />
              ))}
            </div>

            <p className="mb-4 text-xs text-[var(--t3,#a39ba6)]" data-numeric>
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
              <p className={`${CARD} mb-6 text-sm text-[var(--t2,#c7bfca)]`}>
                {t.noConstraints}
              </p>
            )}

            {view === 'month' && (
              <div className={`${CARD} mb-6 p-3`}>
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

            {/* Le détail des anomalies ne s'affiche qu'en vue liste : dans une
                case de calendrier, une anomalie tient en une couleur, pas en
                une phrase. Les deux vues lisent le même diagnostic. */}
            {total === 0 ? (
              <div className="rounded-[var(--r-card,14px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] px-4 py-5">
                <p className="font-semibold text-[var(--lf-200,#b3e7a3)]">
                  {t.allGood}
                </p>
                <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
                  {t.allGoodHint}
                </p>
              </div>
            ) : (
              view === 'list' && (
                <ul className="space-y-2">
                  {data.anomalies.map((a, i) => (
                    <li
                      key={`${a.kind}-${a.matchIds.join('-')}-${i}`}
                      className={`rounded-[var(--r-card,14px)] border px-4 py-3 ${SEVERITY_STYLE[a.severity]}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`}
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
                            {kindLabel(a.kind)}
                            {a.at && <> · {when(a.at)}</>}
                          </p>
                          <p className="text-sm text-[var(--t1,#f4edf7)]">
                            {a.message}
                          </p>

                          {a.suggestion && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <p className="text-sm text-[var(--lf-200,#b3e7a3)]">
                                <span className="text-xs uppercase tracking-[0.1em] text-[var(--lf,#7fca65)]">
                                  {t.suggestionLabel}
                                </span>{' '}
                                —{' '}
                                {format(t.suggestionMove, {
                                  time: when(a.suggestion.moveTo),
                                })}
                                .{' '}
                                <span className="text-[var(--t2,#c7bfca)]">
                                  {a.suggestion.why}
                                </span>
                              </p>
                              <AdminButton
                                variant="secondary"
                                size="xs"
                                onClick={() =>
                                  a.suggestion &&
                                  void applySuggestion(a.suggestion, a.message)
                                }
                                disabled={movingId !== null}
                              >
                                {movingId === a.suggestion.matchId
                                  ? t.applyChecking
                                  : t.applySuggestion}
                              </AdminButton>
                            </div>
                          )}

                          <p className="flex flex-wrap gap-3 pt-1">
                            {a.matchIds.map((matchId) => (
                              <Link
                                key={matchId}
                                href={`/admin/matches/${matchId}`}
                                className="text-xs text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]"
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
      {dialog}
    </>
  );
}
