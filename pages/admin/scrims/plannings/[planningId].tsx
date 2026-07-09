// pages/admin/scrims/plannings/[planningId].tsx
// Admin: détail d'une grille de planification de scrim. Rend la heatmap
// d'overlap des disponibilités ; un clic sur un créneau planifiable (les deux
// équipes dispo) ouvre une confirmation → valide le créneau → crée le scrim.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { withStaffPage } from '@/utils/staff';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AvailabilityGrid, {
  type AvailabilityGridLabels,
} from '@/components/scrim/AvailabilityGrid';
import AvailabilityCalendar, {
  type AvailabilityCalendarLabels,
} from '@/components/scrim/AvailabilityCalendar';
import {
  buildHeatmap,
  isSlotValidatable,
  isFullOverlap,
  type Heatmap,
  type PlanningAvailabilityInput,
} from '@/utils/teams/scrimPlanningOverlap';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import type {
  StaffProps,
  ScrimPlanning,
  ScrimPlanningAvailability,
} from '@/types/admin';

type TeamOption = { id: string; name: string };

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function minutesToTime(min: number): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const getServerSideProps = withStaffPage('manager');

function AdminScrimPlanningDetailPage(_props: StaffProps) {
  const t = useAdminT('adminScrimPlanningsDetail');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const id =
    typeof router.query.planningId === 'string' ? router.query.planningId : '';

  const [planning, setPlanning] = useState<ScrimPlanning | null>(null);
  const [availabilities, setAvailabilities] = useState<
    ScrimPlanningAvailability[]
  >([]);
  const [apiHeatmap, setApiHeatmap] = useState<Heatmap | null>(null);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, teamsRes] = await Promise.all([
        adminFetchJson<{
          planning: ScrimPlanning;
          availabilities: ScrimPlanningAvailability[];
          heatmap: Heatmap;
        }>(`/api/admin/scrim-plannings/${id}`),
        adminFetchJson<{ teams: TeamOption[] }>(
          '/api/admin/teams?limit=200&isActive=true'
        ),
      ]);
      setPlanning(detail.planning);
      setAvailabilities(detail.availabilities || []);
      setApiHeatmap(detail.heatmap || null);
      setTeams(teamsRes.teams || []);
    } catch (err) {
      setError((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, id, t.errorLoad]);

  useEffect(() => {
    if (!router.isReady) return;
    fetchAll();
  }, [fetchAll, router.isReady]);

  const teamName = useMemo(() => {
    const map = new Map(teams.map((tm) => [tm.id, tm.name]));
    return (teamId: string | null) =>
      teamId ? map.get(teamId) || '—' : '—';
  }, [teams]);

  const config = useMemo(
    () => (planning ? planningConfigFromRow(planning) : null),
    [planning]
  );

  // Heatmap : celle renvoyée par l'API, sinon reconstruite depuis les dispos.
  const heatmap = useMemo<Heatmap>(() => {
    if (apiHeatmap) return apiHeatmap;
    const inputs: PlanningAvailabilityInput[] = availabilities.map((av) => ({
      party: av.party,
      userId: av.user_id,
      displayName: av.display_name,
      slots: av.slots,
    }));
    return buildHeatmap(inputs);
  }, [apiHeatmap, availabilities]);

  const gridLabels: AvailabilityGridLabels = useMemo(
    () => ({
      legendTitle: t.gridLegendTitle,
      availableCount: t.gridAvailableCount,
      validatable: t.gridValidatable,
      fullOverlap: t.gridFullOverlap,
      paintHint: t.gridPaintHint,
      cellLabel: t.gridCellLabel,
      empty: t.gridEmpty,
    }),
    [t]
  );

  const calendarLabels: AvailabilityCalendarLabels = useMemo(
    () => ({
      ...gridLabels,
      weekOf: t.calWeekOf,
      prevWeek: t.calPrevWeek,
      nextWeek: t.calNextWeek,
      todayLabel: t.calToday,
    }),
    [gridLabels, t]
  );

  const [view, setView] = useState<'grid' | 'calendar'>('calendar');

  const validatableCount = useMemo(
    () =>
      Object.values(heatmap).filter((cell) => isSlotValidatable(cell)).length,
    [heatmap]
  );
  const fullOverlapCount = useMemo(
    () => Object.values(heatmap).filter((cell) => isFullOverlap(cell)).length,
    [heatmap]
  );

  const isActionable =
    planning?.status === 'open' && !planning?.validated_slot && !busy;

  const onSlotClick = useCallback(
    async (slot: string) => {
      if (!planning || !isActionable) return;
      const cell = heatmap[slot];
      if (!isSlotValidatable(cell)) {
        addToast(t.notValidatable, 'warning');
        return;
      }
      const ok = await confirm({
        title: t.confirmValidateTitle,
        subtitle: format(t.confirmValidateSubtitle, {
          when: formatDate(slot),
        }),
        variant: isFullOverlap(cell) ? 'info' : 'warning',
        confirmLabel: t.confirmValidateConfirm,
        cancelLabel: t.confirmValidateCancel,
      });
      if (!ok) return;
      setBusy(true);
      setError(null);
      try {
        const res = await mutateJson<{
          scrim: { id: string };
          planning: ScrimPlanning;
          warning?: string;
        }>(`/api/admin/scrim-plannings/${planning.id}/validate`, {
          method: 'POST',
          body: JSON.stringify({ slot }),
        });
        addToast(res.warning ? t.validatedWithWarning : t.validated, 'success');
        void router.push(`/admin/scrims/${res.scrim.id}`);
      } catch (err) {
        setError((err as Error)?.message || t.errorValidate);
        setBusy(false);
      }
    },
    [
      planning,
      isActionable,
      heatmap,
      confirm,
      mutateJson,
      router,
      addToast,
      t,
    ]
  );

  async function patchStatus(status: 'cancelled' | 'closed') {
    if (!planning) return;
    const ok = await confirm({
      title: status === 'cancelled' ? t.confirmCancelTitle : t.confirmCloseTitle,
      subtitle:
        status === 'cancelled'
          ? t.confirmCancelSubtitle
          : t.confirmCloseSubtitle,
      variant: status === 'cancelled' ? 'danger' : 'warning',
      confirmLabel: status === 'cancelled' ? t.actionCancel : t.actionClose,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/admin/scrim-plannings/${planning.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      addToast(status === 'cancelled' ? t.cancelled : t.closed, 'success');
      await fetchAll();
    } catch (err) {
      setError((err as Error)?.message || t.errorPatch);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !planning || !config) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white">
        <div className="max-w-3xl mx-auto px-4 pt-20 pb-12">
          {error ? (
            <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          ) : (
            <div className="text-neutral-400 text-sm">{t.loading}</div>
          )}
        </div>
      </div>
    );
  }

  const canValidate = planning.status === 'open' && !planning.validated_slot;

  return (
    <>
      <Head>
        <title>
          {format(t.headTitle, { title: planning.title || t.untitled })}
        </title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href="/admin/scrims/plannings"
                className="text-sm text-neutral-400 hover:text-white"
              >
                {t.backAll}
              </Link>
              <h1 className="text-3xl font-bold mt-1">
                {planning.title || t.untitled}
              </h1>
              <p className="mt-1 text-sm text-neutral-300">
                {format(t.teamsVs, {
                  team1: teamName(planning.team1_id),
                  team2: teamName(planning.team2_id),
                })}
                {planning.game ? (
                  <span className="ml-2 text-neutral-500">{planning.game}</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {planning.status === 'open' && (
                <>
                  <button
                    onClick={() => patchStatus('closed')}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-xs"
                  >
                    {t.actionClose}
                  </button>
                  <button
                    onClick={() => patchStatus('cancelled')}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-xs"
                  >
                    {t.actionCancel}
                  </button>
                </>
              )}
              {planning.scrim_id && (
                <Link
                  href={`/admin/scrims/${planning.scrim_id}`}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs"
                >
                  {t.openScrim}
                </Link>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {planning.validated_slot && (
            <div className="rounded-xl bg-emerald-900/30 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-200">
              {format(t.validatedBanner, {
                when: formatDate(planning.validated_slot),
              })}
            </div>
          )}

          {/* Résumé de la configuration */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
              <div className="text-xs text-neutral-500">{t.cfgHorizon}</div>
              <div className="text-sm font-medium">
                {format(t.cfgHorizonValue, {
                  start: planning.horizon_start,
                  days: planning.horizon_days,
                })}
              </div>
            </div>
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
              <div className="text-xs text-neutral-500">{t.cfgBand}</div>
              <div className="text-sm font-medium">
                {minutesToTime(planning.day_start_min)} –{' '}
                {minutesToTime(planning.day_end_min)}
              </div>
            </div>
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
              <div className="text-xs text-neutral-500">{t.cfgSlot}</div>
              <div className="text-sm font-medium">
                {format(t.cfgSlotValue, { minutes: planning.slot_minutes })}
              </div>
            </div>
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
              <div className="text-xs text-neutral-500">{t.cfgTimezone}</div>
              <div className="text-sm font-medium">{planning.timezone}</div>
            </div>
          </section>

          {/* Grille heatmap */}
          <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t.gridHeading}</h2>
              <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
                <span>
                  {format(t.statValidatable, { count: validatableCount })}
                </span>
                <span>
                  {format(t.statFullOverlap, { count: fullOverlapCount })}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {canValidate ? (
                <p className="text-xs text-neutral-400">{t.validateHint}</p>
              ) : (
                <p className="text-xs text-neutral-500">{t.readOnlyHint}</p>
              )}
              <div className="inline-flex rounded-xl border border-neutral-700 bg-neutral-900/50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setView('calendar')}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    view === 'calendar'
                      ? 'bg-neutral-700 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {t.viewCalendar}
                </button>
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    view === 'grid'
                      ? 'bg-neutral-700 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {t.viewGrid}
                </button>
              </div>
            </div>

            {view === 'calendar' ? (
              <AvailabilityCalendar
                config={config}
                mode="heatmap"
                labels={calendarLabels}
                accent="emerald"
                heatmap={heatmap}
                maxParties={3}
                onSlotClick={canValidate ? onSlotClick : undefined}
                selectedSlot={null}
                disabled={!canValidate || busy}
              />
            ) : (
              <AvailabilityGrid
                config={config}
                mode="heatmap"
                labels={gridLabels}
                accent="emerald"
                heatmap={heatmap}
                maxParties={3}
                onSlotClick={canValidate ? onSlotClick : undefined}
                disabled={!canValidate || busy}
              />
            )}
          </section>
        </div>
      </div>
      {dialog}
    </>
  );
}

export default AdminScrimPlanningDetailPage;
