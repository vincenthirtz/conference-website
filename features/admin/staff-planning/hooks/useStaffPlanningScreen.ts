// features/admin/staff-planning/hooks/useStaffPlanningScreen.ts — état et
// gestes de l'écran « Planning du staff » : mois affiché, jour sélectionné,
// filtre par personne, soirs de match et leur couverture, ajout (répété ou
// non) / modification / retrait / import, copie du récap pour Discord. La page
// ne fait que composer.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { format } from '@/lib/i18n/useAdminT';
import {
  addDaysYmd,
  mondayOf,
  todayYmdInTz,
} from '@/utils/teams/scrimCalendar';
import type { StaffPlanningImport } from '@/utils/staffPlanningCsv';
import {
  staffPlanningPaths,
  type StaffPlanningMatchNight,
  type StaffPlanningSlotRow,
} from '../client';
import {
  countByPerson,
  matchNightEvents,
  monthStats,
  rangeLabel,
  slotsToEvents,
} from '../view';
import { dayLabel } from '../ui/StaffPlanningDayPanel';
import type { NewSlot } from '../ui/StaffPlanningAddForm';
import type { SlotPatch } from '../ui/StaffPlanningSlotEditor';
import type { StaffPlanningTexts } from '../ui/texts';
import { staffPlanningKeys, useStaffPlanning } from './useStaffPlanning';

export const STAFF_PLANNING_TZ = 'Europe/Paris';
const EMPTY: StaffPlanningSlotRow[] = [];
const NO_NIGHTS: StaffPlanningMatchNight[] = [];

type View = { monthAnchor: string; day: string; only: string | null };

export function useStaffPlanningScreen(t: StaffPlanningTexts) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const today = useMemo(() => todayYmdInTz(STAFF_PLANNING_TZ), []);
  const [view, setView] = useState<View>({
    monthAnchor: `${today.slice(0, 7)}-01`,
    day: today,
    only: null,
  });
  const [busy, setBusy] = useState<string | null>(null);

  // La grille montre 6 semaines : on lit exactement cette fenêtre.
  const from = mondayOf(view.monthAnchor);
  const planning = useStaffPlanning(from, addDaysYmd(from, 41));
  const slots = planning.data?.slots ?? EMPTY;
  const people = planning.data?.people ?? [];
  const nights = planning.data?.matchNights ?? NO_NIGHTS;
  const month = view.monthAnchor.slice(0, 7);

  // Soirs de match d'abord (minute -1), puis les créneaux. Filtré sur une
  // personne, l'agenda garde les soirs de match : c'est ce qu'on veut croiser.
  const events = useMemo(
    () => [
      ...matchNightEvents(nights, slots, {
        matchesOne: t.matchesOne,
        matchesMany: t.matchesMany,
        nobody: t.nobody,
      }),
      ...slotsToEvents(slots, people, view.only),
    ],
    [nights, slots, people, view.only, t]
  );
  const stats = useMemo(
    () => monthStats(slots, nights, month),
    [slots, nights, month]
  );
  const dayNight = nights.find((n) => n.date === view.day) ?? null;
  const counts = useMemo(() => countByPerson(slots, month), [slots, month]);
  const daySlots = useMemo(
    () =>
      slots.filter(
        (s) =>
          s.slot_date === view.day &&
          (!view.only || s.person_name === view.only)
      ),
    [slots, view.day, view.only]
  );
  const monthIsEmpty =
    !planning.isPending &&
    !slots.some((s) => s.slot_date.slice(0, 7) === month);

  const createMutation = useIdempotentMutation();
  const updateMutation = useIdempotentMutation();
  const deleteMutation = useIdempotentMutation();
  const importMutation = useIdempotentMutation();
  const refresh = () =>
    qc.invalidateQueries({ queryKey: staffPlanningKeys.all });

  /** Lève en cas d'échec : le formulaire affiche l'erreur (par champ si possible). */
  async function addSlot(slot: NewSlot) {
    const res = await createMutation.mutateJson<{
      created: number;
      skipped: number;
    }>(staffPlanningPaths.list, {
      method: 'POST',
      body: JSON.stringify(slot),
    });
    const created = res?.created ?? 1;
    const skipped = res?.skipped ?? 0;
    addToast(
      skipped > 0
        ? format(t.toastAddedSkipped, { count: created, skipped })
        : created > 1
          ? format(t.toastAddedMany, { count: created })
          : t.toastAdded,
      'success'
    );
    setView((v) => ({ ...v, day: slot.slot_date }));
    await refresh();
  }

  /** Lève en cas d'échec : l'éditeur affiche l'erreur. */
  async function updateSlot(slot: StaffPlanningSlotRow, patch: SlotPatch) {
    await updateMutation.mutateJson(staffPlanningPaths.byId(slot.id), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    addToast(t.toastUpdated, 'success');
    await refresh();
  }

  function onCopied(ok: boolean) {
    addToast(ok ? t.copied : t.copyError, ok ? 'success' : 'error');
  }

  async function removeSlot(slot: StaffPlanningSlotRow) {
    const ok = await confirm({
      title: t.confirmDeleteTitle,
      subtitle: format(t.confirmDeleteSubtitle, {
        person: slot.person_name,
        date: dayLabel(slot.slot_date),
        range: rangeLabel(slot.start_time, slot.end_time),
      }),
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(slot.id);
    try {
      await deleteMutation.mutateJson(staffPlanningPaths.byId(slot.id), {
        method: 'DELETE',
      });
      addToast(t.toastDeleted, 'success');
      await refresh();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function importCsv(parsed: StaffPlanningImport): Promise<boolean> {
    setBusy('import');
    try {
      const res = await importMutation.mutateJson<{
        inserted: number;
        kept: number;
        removed: number;
      }>(staffPlanningPaths.import, {
        method: 'POST',
        body: JSON.stringify({
          months: parsed.months,
          entries: parsed.entries,
        }),
      });
      addToast(
        format(t.toastImportDetail, {
          inserted: res.inserted,
          kept: res.kept ?? 0,
          removed: res.removed ?? 0,
        }),
        'success'
      );
      await refresh();
      return true;
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorImport, 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    dialog,
    planning,
    view,
    setMonth: (monthAnchor: string) => setView((v) => ({ ...v, monthAnchor })),
    setDay: (day: string) => setView((v) => ({ ...v, day })),
    setOnly: (only: string | null) => setView((v) => ({ ...v, only })),
    /** Clic sur une puce : créneau (son id) ou soir de match (`night:<jour>`). */
    openSlot: (id: string) => {
      if (id.startsWith('night:')) {
        const day = id.slice('night:'.length);
        setView((v) => ({ ...v, day }));
        return;
      }
      const slot = slots.find((s) => s.id === id);
      if (slot) setView((v) => ({ ...v, day: slot.slot_date }));
    },
    slots,
    people,
    events,
    counts,
    daySlots,
    dayNight,
    stats,
    monthIsEmpty,
    busy,
    addSlot,
    updateSlot,
    onCopied,
    removeSlot,
    importCsv,
  };
}
