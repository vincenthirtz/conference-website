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
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';
import {
  BestSlotsSection,
  formatDate,
  ParticipationSection,
  PlanningConfigSummary,
  ValidateHint,
  ViewToggle,
} from '@/features/admin/scrims/ui/PlanningDetailBlocks';

const ERROR_BOX =
  'rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]';

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

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
      // Les équipes sont embarquées dans la réponse (relation to-one) : plus
      // d'appel séparé à /api/admin/teams pour traduire deux ids en noms.
      const detail = await adminFetchJson<{
        planning: ScrimPlanning;
        availabilities: ScrimPlanningAvailability[];
        heatmap: Heatmap;
      }>(`/api/admin/scrim-plannings/${id}`);
      setPlanning(detail.planning);
      setAvailabilities(detail.availabilities || []);
      setApiHeatmap(detail.heatmap || null);
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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        {error ? (
          <div className={ERROR_BOX}>{error}</div>
        ) : (
          <div className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</div>
        )}
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
      <div className="min-h-screen space-y-6 px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <Link
            href="/admin/scrims/plannings"
            className="mb-3 inline-block text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
          >
            {t.backAll}
          </Link>
          <EntityHeader
            title={planning.title || t.untitled}
            meta={
              <>
                {format(t.teamsVs, {
                  team1: planning.team1?.name || '—',
                  team2: planning.team2?.name || '—',
                })}
                {planning.game ? ` · ${planning.game}` : null}
              </>
            }
            actions={
              <>
                {planning.status === 'open' && (
                  <>
                    <AdminButton
                      size="sm"
                      onClick={() => extendHorizon()}
                      disabled={busy}
                    >
                      {t.extendWeek}
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      onClick={() => patchStatus('closed')}
                      disabled={busy}
                    >
                      {t.actionClose}
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="danger"
                      onClick={() => patchStatus('cancelled')}
                      disabled={busy}
                    >
                      {t.actionCancel}
                    </AdminButton>
                  </>
                )}
                {planning.scrim_id && (
                  <AdminButtonLink
                    href={`/admin/scrims/${planning.scrim_id}`}
                    size="sm"
                    variant="secondary"
                  >
                    {t.openScrim}
                  </AdminButtonLink>
                )}
              </>
            }
          />
        </div>

        {error && <div className={ERROR_BOX}>{error}</div>}

        {planning.validated_slot && (
          <div className="rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.06)] px-4 py-3 text-sm text-[var(--lf-200,#b3e7a3)]">
            {format(t.validatedBanner, {
              when: formatDate(planning.validated_slot),
            })}
          </div>
        )}

        {/* Résumé de la configuration */}
        <PlanningConfigSummary planning={planning} />

        {/* Suivi de participation (P2-8) */}
        <ParticipationSection participation={participation} />

        {/* Meilleur créneau suggéré (P2-6) */}
        {canValidate && (
          <BestSlotsSection
            ranked={ranked}
            conflictsBySlot={conflictsBySlot}
            busy={busy}
            onValidate={(slot) => runValidate(planning.id, slot, false)}
          />
        )}

        {/* Grille heatmap */}
        <FicheSection
          title={
            <span className="flex items-center gap-2">
              {t.gridHeading}
              {requireStaff && <Chip tone="warn">{t.staffRequiredBadge}</Chip>}
            </span>
          }
          aside={
            <span className="flex flex-wrap gap-4 text-xs text-[var(--t3,#a39ba6)]">
              <span>
                {format(t.statValidatable, { count: validatableCount })}
              </span>
              <span>
                {format(t.statFullOverlap, { count: fullOverlapCount })}
              </span>
            </span>
          }
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <ValidateHint canValidate={canValidate} />
            <ViewToggle view={view} onChange={setView} />
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
        </FicheSection>

        {/* Mes disponibilités staff (peinture perso, party='staff') */}
        <FicheSection
          title={t.myAvailHeading}
          aside={
            <Chip tone="brand">
              {format(t.myAvailCount, { count: mySlots.length })}
            </Chip>
          }
        >
          <p className="-mt-3 mb-4 text-xs text-[var(--t3,#a39ba6)]">
            {t.myAvailHelp}
          </p>
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
              <div className="mt-4 flex justify-end">
                <AdminButton
                  size="sm"
                  variant="secondary"
                  onClick={() => saveMyAvailability()}
                  disabled={savingAvail}
                >
                  {savingAvail ? t.myAvailSaving : t.myAvailSave}
                </AdminButton>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--t4,#807984)]">
              {t.myAvailClosed}
            </p>
          )}
        </FicheSection>
      </div>
      {dialog}
    </>
  );
}

export default AdminScrimPlanningDetailPage;
