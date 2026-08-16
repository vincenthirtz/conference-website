// pages/admin/scrims/plannings/[planningId].tsx
// Admin: détail d'une grille de planification de scrim. Rend la heatmap
// d'overlap des disponibilités ; un clic sur un créneau planifiable (les deux
// équipes dispo) ouvre une confirmation → valide le créneau → crée le scrim.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
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
  rankValidatableSlots,
  type Heatmap,
  type PlanningAvailabilityInput,
} from '@/utils/teams/scrimPlanningOverlap';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import type { SlotConflict } from '@/utils/teams/scrimConflicts';
import type {
  StaffProps,
  ScrimPlanning,
  ScrimPlanningAvailability,
} from '@/types/admin';
import nsAdminScrimPlanningsDetail from '@/lib/i18n/locales/admin-fr/adminScrimPlanningsDetail';

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

export const getServerSideProps = withStaffPage('admin');

function AdminScrimPlanningDetailPage(_props: StaffProps) {
  const t = useAdminT(nsAdminScrimPlanningsDetail);
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

  // Mes propres dispos staff sur cette grille (party='staff', peinture perso).
  const [mySlots, setMySlots] = useState<string[]>([]);
  const [savingAvail, setSavingAvail] = useState(false);

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
      // Récupère mes propres créneaux staff (peinture perso) sur cette grille.
      try {
        const mine = await adminFetchJson<{ slots: string[] }>(
          `/api/admin/scrim-plannings/${id}/availability`
        );
        setMySlots(mine.slots || []);
      } catch {
        // Non-bloquant : la peinture perso reste vide si l'appel échoue.
        setMySlots([]);
      }
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
    return (teamId: string | null) => (teamId ? map.get(teamId) || '—' : '—');
  }, [teams]);

  const config = useMemo(
    () => (planning ? planningConfigFromRow(planning) : null),
    [planning]
  );

  // Un créneau n'est « planifiable » qu'avec le staff dispo quand la grille
  // l'exige (staff_required). Ce flag pilote heatmap, compteurs et ranking.
  const requireStaff = planning?.staff_required ?? false;

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
      Object.values(heatmap).filter((cell) =>
        isSlotValidatable(cell, requireStaff)
      ).length,
    [heatmap, requireStaff]
  );
  const fullOverlapCount = useMemo(
    () => Object.values(heatmap).filter((cell) => isFullOverlap(cell)).length,
    [heatmap]
  );

  // Suivi de participation (P2-8) : quelles parties ont peint ≥1 créneau ?
  const participation = useMemo(() => {
    const team1 = availabilities.some(
      (av) => av.party === 'team1' && av.slots.length > 0
    );
    const team2 = availabilities.some(
      (av) => av.party === 'team2' && av.slots.length > 0
    );
    const staffUsers = new Map<string, string>();
    for (const av of availabilities) {
      if (av.party === 'staff' && av.slots.length > 0) {
        staffUsers.set(av.user_id, av.display_name || av.user_id);
      }
    }
    const staffNames = Array.from(staffUsers.values());
    return { team1, team2, staffCount: staffNames.length, staffNames };
  }, [availabilities]);

  // Classement des créneaux planifiables (P2-6), meilleur d'abord.
  const ranked = useMemo(
    () => rankValidatableSlots(heatmap, requireStaff),
    [heatmap, requireStaff]
  );

  const isActionable =
    planning?.status === 'open' && !planning?.validated_slot && !busy;

  // Aperçu des conflits (double-booking) des meilleurs créneaux, AVANT clic :
  // mêmes conflits que le 409 de la validation (endpoint dédié réutilisant
  // findScrimConflicts). Évite à l'admin de valider un créneau déjà pris.
  const [conflictsBySlot, setConflictsBySlot] = useState<
    Record<string, SlotConflict[]>
  >({});

  const canValidatePlanning =
    planning?.status === 'open' && !planning?.validated_slot;

  useEffect(() => {
    if (!id || !canValidatePlanning) {
      setConflictsBySlot({});
      return;
    }
    const slots = ranked.slice(0, 16).map((r) => r.slot);
    if (slots.length === 0) {
      setConflictsBySlot({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetchJson<{
          conflicts: Record<string, SlotConflict[]>;
        }>(`/api/admin/scrim-plannings/${id}/conflicts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slots }),
        });
        if (!cancelled) setConflictsBySlot(res.conflicts || {});
      } catch {
        // Non-bloquant : l'aperçu reste vide, la validation reste protégée par
        // le 409 côté serveur.
        if (!cancelled) setConflictsBySlot({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, canValidatePlanning, ranked, adminFetchJson]);

  const runValidate = useCallback(
    async (planningId: string, slot: string, force: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const res = await mutateJson<{
          scrim: { id: string };
          planning: ScrimPlanning;
          warning?: string;
        }>(`/api/admin/scrim-plannings/${planningId}/validate`, {
          method: 'POST',
          body: JSON.stringify(force ? { slot, force: true } : { slot }),
        });
        addToast(res.warning ? t.validatedWithWarning : t.validated, 'success');
        void router.push(`/admin/scrims/${res.scrim.id}`);
      } catch (err) {
        // Conflit de créneau (double-booking) : proposer un override forcé.
        if (
          err instanceof AdminFetchError &&
          err.status === 409 &&
          (err.payload as { code?: string } | null)?.code === 'SLOT_CONFLICT'
        ) {
          const conflicts =
            (err.payload as { conflicts?: unknown[] }).conflicts ?? [];
          setBusy(false);
          const forceOk = await confirm({
            title: t.confirmConflictTitle,
            subtitle: format(t.confirmConflictSubtitle, {
              count: conflicts.length,
            }),
            variant: 'danger',
            confirmLabel: t.confirmConflictConfirm,
            cancelLabel: t.confirmValidateCancel,
          });
          if (forceOk) await runValidate(planningId, slot, true);
          return;
        }
        setError((err as Error)?.message || t.errorValidate);
        setBusy(false);
      }
    },
    [mutateJson, router, addToast, confirm, t]
  );

  const onSlotClick = useCallback(
    async (slot: string) => {
      if (!planning || !isActionable) return;
      const cell = heatmap[slot];
      if (!isSlotValidatable(cell, requireStaff)) {
        addToast(t.notValidatable, 'warning');
        return;
      }
      // Aperçu de conflit connu pour ce créneau → avertit dès la confirmation.
      const conflictCount = (conflictsBySlot[slot] ?? []).length;
      const baseSubtitle = format(t.confirmValidateSubtitle, {
        when: formatDate(slot),
      });
      const ok = await confirm({
        title: t.confirmValidateTitle,
        subtitle:
          conflictCount > 0
            ? `${baseSubtitle} ${format(t.confirmValidateConflict, {
                count: conflictCount,
              })}`
            : baseSubtitle,
        variant:
          conflictCount > 0
            ? 'danger'
            : isFullOverlap(cell)
              ? 'info'
              : 'warning',
        confirmLabel: t.confirmValidateConfirm,
        cancelLabel: t.confirmValidateCancel,
      });
      if (!ok) return;
      await runValidate(planning.id, slot, false);
    },
    [
      planning,
      isActionable,
      heatmap,
      requireStaff,
      conflictsBySlot,
      confirm,
      addToast,
      t,
      runValidate,
    ]
  );

  async function patchStatus(status: 'cancelled' | 'closed') {
    if (!planning) return;
    const ok = await confirm({
      title:
        status === 'cancelled' ? t.confirmCancelTitle : t.confirmCloseTitle,
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

  // Prolonger l'horizon d'une semaine (P2-7) : rallonge la fenêtre de dispos
  // et réarme le cron de rappel (reminder_pinged_at → null).
  async function extendHorizon() {
    if (!planning) return;
    const ok = await confirm({
      title: t.confirmExtendTitle,
      subtitle: t.confirmExtendSubtitle,
      variant: 'info',
      confirmLabel: t.extendConfirm,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/admin/scrim-plannings/${planning.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          horizon_days: planning.horizon_days + 7,
          reminder_pinged_at: null,
        }),
      });
      addToast(t.extended, 'success');
      await fetchAll();
    } catch (err) {
      setError((err as Error)?.message || t.errorPatch);
    } finally {
      setBusy(false);
    }
  }

  // Enregistre mes créneaux staff (party='staff') sur cette grille, puis
  // rafraîchit la heatmap d'overlap au-dessus pour intégrer mes dispos.
  async function saveMyAvailability() {
    if (!planning) return;
    setSavingAvail(true);
    setError(null);
    try {
      const res = await mutateJson<{ success: boolean; slots: string[] }>(
        `/api/admin/scrim-plannings/${planning.id}/availability`,
        {
          method: 'PUT',
          body: JSON.stringify({ slots: mySlots }),
        }
      );
      setMySlots(res.slots || []);
      addToast(t.myAvailSaved, 'success');
      await fetchAll();
    } catch (err) {
      const msg =
        err instanceof AdminFetchError
          ? (err.payload as { error?: string } | null)?.error || t.myAvailError
          : (err as Error)?.message || t.myAvailError;
      addToast(msg, 'error');
    } finally {
      setSavingAvail(false);
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
                    onClick={() => extendHorizon()}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-xs"
                  >
                    {t.extendWeek}
                  </button>
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

          {/* Suivi de participation (P2-8) */}
          <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t.participationHeading}</h2>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  participation.team1
                    ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-200'
                    : 'bg-neutral-800/70 border border-neutral-700 text-neutral-500'
                }`}
              >
                {t.partyTeam1} {participation.team1 ? t.painted : t.notPainted}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  participation.team2
                    ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-200'
                    : 'bg-neutral-800/70 border border-neutral-700 text-neutral-500'
                }`}
              >
                {t.partyTeam2} {participation.team2 ? t.painted : t.notPainted}
              </span>
              <span
                title={participation.staffNames.join(', ')}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  participation.staffCount > 0
                    ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-200'
                    : 'bg-neutral-800/70 border border-neutral-700 text-neutral-500'
                }`}
              >
                {format(t.partyStaff, { count: participation.staffCount })}
                {participation.staffCount > 0 && (
                  <span className="truncate text-emerald-300/70">
                    · {participation.staffNames.join(', ')}
                  </span>
                )}
              </span>
            </div>
          </section>

          {/* Meilleur créneau suggéré (P2-6) */}
          {canValidate && ranked.length > 0 && (
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">{t.bestSlotHeading}</h2>
                <button
                  onClick={() =>
                    runValidate(planning.id, ranked[0].slot, false)
                  }
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold"
                >
                  {t.bestSlotValidateBest}
                </button>
              </div>
              <ul className="space-y-2">
                {ranked.slice(0, 3).map((r) => (
                  <li
                    key={r.slot}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-900/50 border border-neutral-700/50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium">
                        {formatDate(r.slot)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          r.full
                            ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-200'
                            : 'bg-amber-900/30 border border-amber-500/40 text-amber-200'
                        }`}
                      >
                        {r.full ? t.bestSlotFull : t.bestSlotPartial}
                      </span>
                      {(conflictsBySlot[r.slot]?.length ?? 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-red-900/40 border border-red-500/50 px-2.5 py-0.5 text-xs font-medium text-red-200"
                          title={t.conflictBadgeTitle}
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          {format(t.conflictBadge, {
                            count: conflictsBySlot[r.slot]!.length,
                          })}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => runValidate(planning.id, r.slot, false)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-xs"
                    >
                      {t.bestSlotValidate}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {canValidate && ranked.length === 0 && (
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-2">
                {t.bestSlotHeading}
              </h2>
              <p className="text-sm text-neutral-500">{t.noValidatableSlot}</p>
            </section>
          )}

          {/* Grille heatmap */}
          <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{t.gridHeading}</h2>
                {requireStaff && (
                  <span className="inline-flex items-center rounded-full bg-amber-900/30 border border-amber-500/40 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                    {t.staffRequiredBadge}
                  </span>
                )}
              </div>
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
                // Callout de validation toujours visible : le swatch reproduit
                // exactement le rendu d'une cellule planifiable (fond vert +
                // soulignement) pour ancrer visuellement l'affordance de clic.
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
                  <span
                    className="relative inline-block h-4 w-5 flex-shrink-0 rounded border border-emerald-300/40 bg-emerald-500/30 after:absolute after:inset-x-1 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-emerald-200/80 after:content-['']"
                    aria-hidden="true"
                  />
                  <span>{t.validateHint}</span>
                </div>
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
                requireStaff={requireStaff}
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
                requireStaff={requireStaff}
                onSlotClick={canValidate ? onSlotClick : undefined}
                disabled={!canValidate || busy}
              />
            )}
          </section>

          {/* Mes disponibilités staff (peinture perso, party='staff') */}
          <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t.myAvailHeading}</h2>
                <p className="mt-1 text-xs text-neutral-400">{t.myAvailHelp}</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-purple-900/30 border border-purple-500/40 px-2.5 py-0.5 text-xs font-medium text-purple-200">
                {format(t.myAvailCount, { count: mySlots.length })}
              </span>
            </div>

            {planning.status === 'open' ? (
              <>
                <AvailabilityCalendar
                  config={config}
                  mode="paint"
                  labels={calendarLabels}
                  accent="purple"
                  value={mySlots}
                  onChange={setMySlots}
                  requireStaff={requireStaff}
                  disabled={savingAvail}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => saveMyAvailability()}
                    disabled={savingAvail}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-semibold"
                  >
                    {savingAvail ? t.myAvailSaving : t.myAvailSave}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">{t.myAvailClosed}</p>
            )}
          </section>
        </div>
      </div>
      {dialog}
    </>
  );
}

export default AdminScrimPlanningDetailPage;
