// features/admin/staff-planning/hooks/useStaffPlanningScreen.ts — état et
// gestes de l'écran « Planning du staff » : mois affiché, jour sélectionné,
// filtre par personne, ajout / retrait / import. La page ne fait que composer.

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
import { staffPlanningPaths, type StaffPlanningSlotRow } from '../client';
import { countByPerson, rangeLabel, slotsToEvents } from '../view';
import { dayLabel } from '../ui/StaffPlanningDayPanel';
import type { NewSlot } from '../ui/StaffPlanningAddForm';
import type { StaffPlanningTexts } from '../ui/texts';
import { staffPlanningKeys, useStaffPlanning } from './useStaffPlanning';

export const STAFF_PLANNING_TZ = 'Europe/Paris';
const EMPTY: StaffPlanningSlotRow[] = [];

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
  const month = view.monthAnchor.slice(0, 7);

  const events = useMemo(
    () => slotsToEvents(slots, people, view.only),
    [slots, people, view.only]
  );
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
  const deleteMutation = useIdempotentMutation();
  const importMutation = useIdempotentMutation();
  const refresh = () =>
    qc.invalidateQueries({ queryKey: staffPlanningKeys.all });

  /** Lève en cas d'échec : le formulaire affiche l'erreur (par champ si possible). */
  async function addSlot(slot: NewSlot) {
    await createMutation.mutateJson(staffPlanningPaths.list, {
      method: 'POST',
      body: JSON.stringify(slot),
    });
    addToast(t.toastAdded, 'success');
    setView((v) => ({ ...v, day: slot.slot_date }));
    await refresh();
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
      const res = await importMutation.mutateJson<{ inserted: number }>(
        staffPlanningPaths.import,
        {
          method: 'POST',
          body: JSON.stringify({
            months: parsed.months,
            entries: parsed.entries,
          }),
        }
      );
      addToast(format(t.toastImported, { inserted: res.inserted }), 'success');
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
    openSlot: (id: string) => {
      const slot = slots.find((s) => s.id === id);
      if (slot) setView((v) => ({ ...v, day: slot.slot_date }));
    },
    slots,
    people,
    events,
    counts,
    daySlots,
    monthIsEmpty,
    busy,
    addSlot,
    removeSlot,
    importCsv,
  };
}
