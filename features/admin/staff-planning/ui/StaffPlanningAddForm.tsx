// features/admin/staff-planning/ui/StaffPlanningAddForm.tsx — ajouter un
// créneau à la main (jamais écrasé par un import). Formulaire sur schéma
// (`useAdminForm`) : validation locale, erreurs par champ, erreur serveur
// affichée sous le formulaire. Le jour suit le jour cliqué dans l'agenda.
// « Mes dispos » (`fixedPerson`) : la personne est le lecteur, non modifiable
// (l'API refuse de toute façon un autre pseudo).

import { useEffect } from 'react';
import * as z from 'zod';
import { useAdminForm } from '@/hooks/admin/useAdminForm';
import { FormError } from '@/components/admin/form/FormField';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanEyebrow,
  rubanFormInput,
  rubanLabel,
} from '@/features/ruban/ruban';
import { STAFF_PLANNING_ROLES, type StaffPlanningRole } from '../schemas';
import type { StaffPlanningTexts } from './texts';

export type NewSlot = {
  person_name: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  role: StaffPlanningRole | null;
  note: string | null;
  /** Répétition hebdomadaire jusqu'à cette date incluse, ou aucune. */
  repeat_until: string | null;
};

const addSchema = z
  .object({
    person_name: z.string().trim().min(1).max(80),
    slot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    role: z
      .enum([...STAFF_PLANNING_ROLES, ''])
      .transform((r) => (r === '' ? null : r)),
    note: z
      .string()
      .max(200)
      .transform((n) => n.trim() || null),
    repeat: z.boolean(),
    repeat_until: z.string(),
  })
  .refine((v) => v.start_time !== v.end_time, {
    path: ['end_time'],
    message: '≠ début',
  })
  .refine((v) => !v.repeat || v.repeat_until >= v.slot_date, {
    path: ['repeat_until'],
    message: '≥ jour',
  })
  .transform(({ repeat, repeat_until, ...slot }) => ({
    ...slot,
    repeat_until: repeat && repeat_until ? repeat_until : null,
  }));

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="mt-1 block text-xs text-[var(--err,#e5484d)]">
      {message}
    </span>
  ) : null;
}

export default function StaffPlanningAddForm({
  t,
  people,
  day,
  fixedPerson = null,
  onSubmit,
}: {
  t: StaffPlanningTexts;
  people: string[];
  day: string;
  /** « Mes dispos » : le pseudo du lecteur, imposé. */
  fixedPerson?: string | null;
  /** Lève en cas d'échec : l'erreur s'affiche dans le formulaire. */
  onSubmit: (slot: NewSlot) => Promise<void>;
}) {
  const form = useAdminForm({
    schema: addSchema,
    initialValues: {
      person_name: fixedPerson ?? '',
      slot_date: day,
      start_time: '19:00',
      end_time: '22:00',
      role: '',
      note: '',
      repeat: false,
      repeat_until: '',
    },
    errorFallback: t.errorAdd,
    onSubmit: async (slot) => {
      await onSubmit(slot);
      form.setValue('note', '');
    },
  });
  const { setValue } = form;
  useEffect(() => setValue('slot_date', day), [day, setValue]);
  useEffect(() => {
    if (fixedPerson) setValue('person_name', fixedPerson);
  }, [fixedPerson, setValue]);
  const listId = `${form.formId}-people`;

  return (
    <form className={rubanCardPadded} onSubmit={form.handleSubmit} noValidate>
      <p className={rubanEyebrow}>
        {fixedPerson ? t.mineAddTitle : t.addTitle}
      </p>
      {fixedPerson && (
        <p className="mt-1 text-sm font-semibold text-[var(--t1,#f4edf7)]">
          {fixedPerson}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={`col-span-2${fixedPerson ? ' hidden' : ''}`}>
          <span className={rubanLabel}>{t.fieldPerson}</span>
          <input
            {...form.field('person_name')}
            className={rubanFormInput}
            list={listId}
            maxLength={80}
          />
          <datalist id={listId}>
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <FieldError message={form.errors.person_name} />
        </label>
        <label className="col-span-2">
          <span className={rubanLabel}>{t.fieldDate}</span>
          <input
            {...form.field('slot_date')}
            type="date"
            className={rubanFormInput}
          />
          <FieldError message={form.errors.slot_date} />
        </label>
        <label>
          <span className={rubanLabel}>{t.fieldStart}</span>
          <input
            {...form.field('start_time')}
            type="time"
            step={900}
            className={rubanFormInput}
          />
          <FieldError message={form.errors.start_time} />
        </label>
        <label>
          <span className={rubanLabel}>{t.fieldEnd}</span>
          <input
            {...form.field('end_time')}
            type="time"
            step={900}
            className={rubanFormInput}
          />
          <FieldError message={form.errors.end_time} />
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
          <FieldError message={form.errors.note} />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
          <input {...form.checkbox('repeat')} type="checkbox" />
          {t.fieldRepeat}
        </label>
        {form.values.repeat && (
          <label className="col-span-2">
            <span className={rubanLabel}>{t.fieldRepeatUntil}</span>
            <input
              {...form.field('repeat_until')}
              type="date"
              min={form.values.slot_date}
              className={rubanFormInput}
            />
            <span className="mt-1 block text-xs text-[var(--t3,#a39ba6)]">
              {t.repeatHint}
            </span>
            <FieldError message={form.errors.repeat_until} />
          </label>
        )}
      </div>
      <FormError message={form.formError} />
      <AdminButton
        type="submit"
        variant="primary"
        size="sm"
        className="mt-4"
        disabled={form.isSubmitting}
      >
        {t.addSubmit}
      </AdminButton>
    </form>
  );
}
