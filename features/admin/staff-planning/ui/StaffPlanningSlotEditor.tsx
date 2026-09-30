// features/admin/staff-planning/ui/StaffPlanningSlotEditor.tsx — modifier un
// créneau sur place (rôle, horaires, note). Utile surtout après un import : le
// tableur ne porte pas de rôle, on le pose ici, et un réimport le conserve.

import * as z from 'zod';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { FormError } from '@/components/admin/form/FormField';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanFormInput, rubanLabel } from '@/features/ruban/ruban';
import type { StaffPlanningSlotRow } from '../client';
import { STAFF_PLANNING_ROLES, type StaffPlanningRole } from '../schemas';
import type { StaffPlanningTexts } from './texts';

export type SlotPatch = {
  start_time: string;
  end_time: string;
  role: StaffPlanningRole | null;
  note: string | null;
};

const editSchema = z
  .object({
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    role: z
      .enum([...STAFF_PLANNING_ROLES, ''])
      .transform((r) => (r === '' ? null : r)),
    note: z
      .string()
      .max(200)
      .transform((n) => n.trim() || null),
  })
  .refine((v) => v.start_time !== v.end_time, {
    path: ['end_time'],
    message: '≠ début',
  });

export default function StaffPlanningSlotEditor({
  t,
  slot,
  onSave,
  onCancel,
}: {
  t: StaffPlanningTexts;
  slot: StaffPlanningSlotRow;
  /** Lève en cas d'échec : l'erreur s'affiche dans le formulaire. */
  onSave: (patch: SlotPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useAdminForm({
    schema: editSchema,
    initialValues: {
      start_time: slot.start_time,
      end_time: slot.end_time,
      role: slot.role ?? '',
      note: slot.note ?? '',
    },
    errorFallback: t.errorUpdate,
    onSubmit: onSave,
  });

  return (
    <form
      onSubmit={form.handleSubmit}
      noValidate
      className="mt-2 grid grid-cols-2 gap-2"
    >
      <label>
        <span className={rubanLabel}>{t.fieldStart}</span>
        <input
          {...form.field('start_time')}
          type="time"
          step={900}
          className={rubanFormInput}
        />
      </label>
      <label>
        <span className={rubanLabel}>{t.fieldEnd}</span>
        <input
          {...form.field('end_time')}
          type="time"
          step={900}
          className={rubanFormInput}
        />
      </label>
      <label className="col-span-2">
        <span className={rubanLabel}>{t.fieldRole}</span>
        <select {...form.field('role')} className={rubanFormInput}>
          <option value="">{t.roleNone}</option>
          {STAFF_PLANNING_ROLES.map((r) => (
            <option key={r} value={r}>
              {t[`role_${r}`]}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2">
        <span className={rubanLabel}>{t.fieldNote}</span>
        <input
          {...form.field('note')}
          className={rubanFormInput}
          maxLength={200}
        />
      </label>
      <div className="col-span-2">
        <FormError message={form.formError ?? form.errors.end_time} />
      </div>
      <div className="col-span-2 flex gap-2">
        <AdminButton
          type="submit"
          variant="primary"
          size="xs"
          disabled={form.isSubmitting}
        >
          {t.saveSlot}
        </AdminButton>
        <AdminButton type="button" variant="ghost" size="xs" onClick={onCancel}>
          {t.cancelEdit}
        </AdminButton>
      </div>
    </form>
  );
}
