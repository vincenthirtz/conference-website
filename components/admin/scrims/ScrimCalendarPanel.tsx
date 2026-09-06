// components/admin/scrims/ScrimCalendarPanel.tsx
// Onglet « Agenda » de l'espace scrims admin. Vue SEMAINE (poser un scrim sur
// un créneau, drag&drop pour replanifier, poignée pour la durée) et vue MOIS
// (aperçu 6×7). Les matches programmés sont affichés en lecture seule pour
// repérer les collisions. Filtres équipe + statut. Auto-suffisant : fetch de la
// plage visible sur /api/admin/scrims/calendar, PATCH idempotent + toasts.

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import ScrimFormModal from '@/components/admin/scrims/ScrimFormModal';
import ScrimCalendar, {
  type CalendarScrim,
  type CalendarMatch,
} from '@/components/admin/scrims/ScrimCalendar';
import ScrimMonthCalendar from '@/components/admin/scrims/ScrimMonthCalendar';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { SlotConflict } from '@/utils/teams/scrimConflicts';
import { summarizeConflicts } from '@/utils/teams/scrimConflictLabel';
import {
  mondayOf,
  addDaysYmd,
  todayYmdInTz,
  localInputValue,
  zonedTimeToUtcIso,
} from '@/utils/teams/scrimCalendar';
import nsAdminScrimsList from '@/lib/i18n/locales/admin-fr/adminScrimsList';

const TZ = 'Europe/Paris';
const ALL_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

type RawScrim = {
  id: string;
  name: string;
  status: string;
  scheduled_date: string | null;
  duration_minutes: number | null;
  team1_id: string | null;
  team2_id: string | null;
  team1Name: string | null;
  team2Name: string | null;
};

type RawMatch = {
  id: string;
  status: string;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1Name: string | null;
  team2Name: string | null;
};

type CalendarPayload = { scrims: RawScrim[]; matches: RawMatch[] };

type PatchBody = { scheduled_date?: string; duration_minutes?: number };
type PatchResponse = {
  success: boolean;
  scrim: unknown;
  conflicts: SlotConflict[];
};

export default function ScrimCalendarPanel() {
  const t = useAdminT(nsAdminScrimsList);
  const router = useRouter();
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();

  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState<string>(() =>
    mondayOf(todayYmdInTz(TZ))
  );
  const [monthAnchor, setMonthAnchor] = useState<string>(
    () => `${todayYmdInTz(TZ).slice(0, 7)}-01`
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [defaults, setDefaults] = useState<
    { scheduled_date: string; status: string } | undefined
  >(undefined);

  // Filtres client-side.
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string[]>([...ALL_STATUSES]);

  // Overrides optimistes (déplacement / resize) le temps du refetch.
  const [overrides, setOverrides] = useState<Record<string, PatchBody>>({});
  const [rawMatches, setRawMatches] = useState<RawMatch[]>([]);

  // Plage visible → paramètres from/to (bornes UTC des jours affichés).
  const range = useMemo(() => {
    if (view === 'week') {
      return {
        from: zonedTimeToUtcIso(weekStart, 0, TZ),
        to: zonedTimeToUtcIso(addDaysYmd(weekStart, 7), 0, TZ),
      };
    }
    const gridStart = mondayOf(monthAnchor);
    return {
      from: zonedTimeToUtcIso(gridStart, 0, TZ),
      to: zonedTimeToUtcIso(addDaysYmd(gridStart, 42), 0, TZ),
    };
  }, [view, weekStart, monthAnchor]);

  const {
    data: rawScrims,
    loading,
    error: errorMsg,
    refresh,
  } = useAdminResource<RawScrim, CalendarPayload>(
    '/api/admin/scrims/calendar',
    {
      includeTotal: false,
      params: { from: range.from, to: range.to },
      select: (res) => res.scrims || [],
      onData: (res) => setRawMatches(res.matches || []),
    }
  );

  // Un nouveau fetch fait autorité : on purge les overrides optimistes.
  useEffect(() => {
    setOverrides({});
  }, [rawScrims]);

  // Options d'équipe dérivées des scrims ET des matchs de la plage.
  //
  // L'équipe SÉLECTIONNÉE est conservée même quand elle ne joue rien dans la
  // plage affichée : sans ça, changer de semaine faisait disparaître l'option
  // du menu alors que le filtre restait actif — l'agenda paraissait vide sans
  // que rien ne l'explique, et on ne pouvait plus le désélectionner.
  const [stickyTeam, setStickyTeam] = useState<{ id: string; name: string } | null>(
    null
  );

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of rawScrims) {
      if (s.team1_id && s.team1Name) map.set(s.team1_id, s.team1Name);
      if (s.team2_id && s.team2Name) map.set(s.team2_id, s.team2Name);
    }
    for (const m of rawMatches) {
      if (m.team1_id && m.team1Name) map.set(m.team1_id, m.team1Name);
      if (m.team2_id && m.team2Name) map.set(m.team2_id, m.team2Name);
    }
    if (stickyTeam && !map.has(stickyTeam.id)) {
      map.set(stickyTeam.id, stickyTeam.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawScrims, rawMatches, stickyTeam]);

  // Mémorise le libellé au moment du choix : c'est ce qui permet de garder
  // l'option affichable une fois sortie de la plage.
  const selectTeam = useCallback(
    (id: string) => {
      setTeamFilter(id);
      setStickyTeam(
        id ? { id, name: teamOptions.find((o) => o.id === id)?.name ?? id } : null
      );
    },
    [teamOptions]
  );

  const activeStatuses = useMemo(() => new Set(statusFilter), [statusFilter]);

  const calendarScrims = useMemo<CalendarScrim[]>(
    () =>
      rawScrims
        .filter((s) => activeStatuses.has(s.status))
        .filter(
          (s) =>
            !teamFilter ||
            s.team1_id === teamFilter ||
            s.team2_id === teamFilter
        )
        .map((s) => {
          const ov = overrides[s.id];
          return {
            id: s.id,
            name: s.name,
            status: s.status,
            scheduled_date: ov?.scheduled_date ?? s.scheduled_date,
            duration_minutes:
              ov?.duration_minutes ?? s.duration_minutes ?? null,
            team1Name: s.team1Name,
            team2Name: s.team2Name,
          };
        }),
    [rawScrims, overrides, activeStatuses, teamFilter]
  );

  const calendarMatches = useMemo<CalendarMatch[]>(
    () =>
      rawMatches
        // Filtre sur l'ID et non sur le nom : deux équipes homonymes ne se
        // mélangent plus, et une casse différente ne fait plus disparaître un
        // match sans explication.
        .filter(
          (m) =>
            !teamFilter ||
            m.team1_id === teamFilter ||
            m.team2_id === teamFilter
        )
        .map((m) => ({
          id: m.id,
          status: m.status,
          scheduled_at: m.scheduled_at,
          team1Name: m.team1Name,
          team2Name: m.team2Name,
        })),
    [rawMatches, teamFilter]
  );

  const weekLabels = useMemo(
    () => ({
      today: t.calToday,
      prevWeek: t.calPrevWeek,
      nextWeek: t.calNextWeek,
      thisWeek: t.calThisWeek,
      weekOf: t.calWeekOf,
      createHint: t.calCreateHint,
      matchTag: t.calMatchTag,
    }),
    [t]
  );

  const monthLabels = useMemo(
    () => ({
      monthPrev: t.calMonthPrev,
      monthNext: t.calMonthNext,
      matchTag: t.calMatchTag,
      moreEvents: t.calMoreEvents,
      collapse: t.calCollapse,
    }),
    [t]
  );

  const onCreateAt = useCallback((dayYmd: string, minuteOfDay: number) => {
    setDefaults({
      scheduled_date: localInputValue(dayYmd, minuteOfDay),
      status: 'scheduled',
    });
    setModalOpen(true);
  }, []);

  const onOpenScrim = useCallback(
    (id: string) => {
      void router.push(`/admin/scrims/${id}`);
    },
    [router]
  );

  const onOpenMatch = useCallback(
    (id: string) => {
      void router.push(`/admin/matches/${id}`);
    },
    [router]
  );

  const patchScrim = useCallback(
    async (id: string, body: PatchBody, kind: 'move' | 'resize') => {
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...body } }));
      try {
        const res = await mutateJson<PatchResponse>(`/api/admin/scrims/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        // On nomme ce qui bloque : le détail est calculé côté serveur et
        // transmis, il serait absurde de le remplacer par « il y a un conflit ».
        const summary = summarizeConflicts(
          res.conflicts,
          (iso) =>
            new Date(iso).toLocaleString('fr-FR', {
              timeZone: TZ,
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }),
          t.calConflictUnnamed
        );
        if (summary) {
          addToast(
            summary.others > 0
              ? format(t.calConflictWarningMore, {
                  name: summary.name,
                  when: summary.when,
                  count: summary.others,
                })
              : format(t.calConflictWarningOne, {
                  name: summary.name,
                  when: summary.when,
                }),
            'warning'
          );
        } else {
          addToast(
            kind === 'move' ? t.calRescheduled : t.calResized,
            'success'
          );
        }
        refresh();
      } catch {
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        addToast(t.calUpdateError, 'error');
      }
    },
    [mutateJson, addToast, refresh, t]
  );

  const onMoveScrim = useCallback(
    (id: string, dayYmd: string, minute: number) => {
      void patchScrim(
        id,
        { scheduled_date: zonedTimeToUtcIso(dayYmd, minute, TZ) },
        'move'
      );
    },
    [patchScrim]
  );

  const onResizeScrim = useCallback(
    (id: string, durationMinutes: number) => {
      void patchScrim(id, { duration_minutes: durationMinutes }, 'resize');
    },
    [patchScrim]
  );

  const onSelectDay = useCallback((dayYmd: string) => {
    setWeekStart(mondayOf(dayYmd));
    setView('week');
  }, []);

  const toggleStatus = useCallback((status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  }, []);

  const statusLabel = (status: string): string => {
    switch (status) {
      case 'draft':
        return t.statusDraft;
      case 'scheduled':
        return t.statusScheduled;
      case 'running':
        return t.statusRunning;
      case 'completed':
        return t.statusCompleted;
      case 'cancelled':
        return t.statusCancelled;
      default:
        return status;
    }
  };

  return (
    <>
      <ScrimFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={refresh}
        defaults={defaults}
      />

      {/* Barre d'outils : bascule de vue + filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={`${t.calViewWeek} / ${t.calViewMonth}`}
          className="inline-flex overflow-hidden rounded-lg border border-neutral-700"
        >
          <button
            type="button"
            aria-pressed={view === 'week'}
            onClick={() => setView('week')}
            className={`px-3 py-1 text-xs font-medium transition ${
              view === 'week'
                ? 'bg-neutral-200 text-neutral-900'
                : 'bg-neutral-900/60 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {t.calViewWeek}
          </button>
          <button
            type="button"
            aria-pressed={view === 'month'}
            onClick={() => setView('month')}
            className={`px-3 py-1 text-xs font-medium transition ${
              view === 'month'
                ? 'bg-neutral-200 text-neutral-900'
                : 'bg-neutral-900/60 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {t.calViewMonth}
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span>{t.calFilterTeam}</span>
          <select
            aria-label={t.calFilterTeam}
            value={teamFilter}
            onChange={(e) => selectTeam(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2 py-1 text-neutral-200"
          >
            <option value="">{t.calFilterAllTeams}</option>
            {teamOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        <div
          role="group"
          aria-label={t.calFilterStatus}
          className="flex flex-wrap items-center gap-1"
        >
          {ALL_STATUSES.map((status) => {
            const on = activeStatuses.has(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(status)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                  on
                    ? 'border-neutral-500 bg-neutral-700/70 text-neutral-100'
                    : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800'
                }`}
              >
                {statusLabel(status)}
              </button>
            );
          })}
        </div>
      </div>

      <AdminListShell
        loading={loading}
        error={errorMsg}
        isEmpty={false}
        loadingLabel={t.loading}
        emptyTitle={t.empty}
      >
        {view === 'week' ? (
          <ScrimCalendar
            tz={TZ}
            weekStart={weekStart}
            scrims={calendarScrims}
            matches={calendarMatches}
            labels={weekLabels}
            onWeekChange={setWeekStart}
            onCreateAt={onCreateAt}
            onOpenScrim={onOpenScrim}
            onOpenMatch={onOpenMatch}
            onMoveScrim={onMoveScrim}
            onResizeScrim={onResizeScrim}
          />
        ) : (
          <ScrimMonthCalendar
            tz={TZ}
            monthAnchor={monthAnchor}
            scrims={calendarScrims}
            matches={calendarMatches}
            labels={monthLabels}
            onMonthChange={setMonthAnchor}
            onSelectDay={onSelectDay}
            onOpenScrim={onOpenScrim}
            onOpenMatch={onOpenMatch}
          />
        )}
      </AdminListShell>
    </>
  );
}
