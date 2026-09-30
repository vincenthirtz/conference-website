// features/player/scrims/ui/MyScrimSearchPanel.tsx — « Mon annonce » :
// créneaux datés (qui expirent seuls) + note. Formulaire sur schéma
// (`useSchemaForm`) : aucun `useState` de champ. Le serveur re-vérifie la
// permission `manage_scrims`, la forme et l'appartenance des créneaux.

import { useEffect, useMemo } from 'react';
import * as z from 'zod';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import FormField, {
  FormError,
  FormFieldset,
  inputClass,
} from '@/features/ruban/FormField';
import { Button, Card, Chip } from '@/features/ruban';
import ScrimSlotCalendarPicker, {
  type ScrimSlotCalendarLabels,
} from '@/components/player/ScrimSlotCalendarPicker';
import { SCRIM_SEARCH_MAX_SLOTS, type ScrimSearchDto } from '../schemas';
import { usePlayerErrorText } from '../../_shared/useErrorText';

export type MyScrimSearchTexts = {
  mySearchTitle: string;
  mySearchHelp: string;
  mySearchActive: string;
  expiresAt: string;
  noteLabel: string;
  notePlaceholder: string;
  publishCta: string;
  relaunchCta: string;
  closeCta: string;
  errorNoSlot: string;
  errorPublish: string;
  slotsLabel: string;
};

export type MyScrimSearchValues = { slots: string[]; note: string | null };

function makeSchema(noSlot: string) {
  return z.object({
    slots: z
      .array(z.string())
      .transform((list) => list.filter(Boolean))
      .pipe(z.array(z.string()).min(1, noSlot)),
    note: z
      .string()
      .max(280)
      .transform((v) => v.trim() || null),
  });
}

export default function MyScrimSearchPanel({
  t,
  pickerLabels,
  search,
  busy,
  fmtSlot,
  format,
  onPublish,
  onClose,
}: {
  t: MyScrimSearchTexts;
  pickerLabels: ScrimSlotCalendarLabels;
  search: ScrimSearchDto | null;
  busy: boolean;
  fmtSlot: (iso: string) => string;
  format: (tpl: string, vars: Record<string, string | number>) => string;
  onPublish: (values: MyScrimSearchValues) => Promise<void>;
  /** `true` si l'annonce est close : le formulaire se vide alors. */
  onClose: () => Promise<boolean>;
}) {
  const schema = useMemo(() => makeSchema(t.errorNoSlot), [t.errorNoSlot]);
  const errorText = usePlayerErrorText();
  const form = useSchemaForm({
    schema,
    initialValues: { slots: [] as string[], note: '' },
    onSubmit: onPublish,
    errorFallback: t.errorPublish,
    describeError: errorText,
  });

  // L'annonce active (re)chargée préremplit le formulaire, comme avant.
  const loadedId = search?.id ?? null;
  const { reset } = form;
  // `loadedId` suffit : relire la même annonce ne réécrit pas la saisie.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clé = l'annonce
  useEffect(() => {
    if (!search) return;
    reset({ slots: search.slots ?? [], note: search.note ?? '' });
  }, [loadedId, reset]);

  return (
    <Card as="section" className="mb-6" data-testid="my-scrim-search">
      <h2 className="text-lg font-semibold">{t.mySearchTitle}</h2>
      <p className="mt-1 text-sm text-[var(--t3,#a39ba6)]">{t.mySearchHelp}</p>

      {search && (
        <div className="mt-3">
          <p className="text-sm font-semibold">{t.mySearchActive}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {search.slots.map((s) => (
              <li key={s}>
                <Chip tone="ok">{fmtSlot(s)}</Chip>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-[var(--t3,#a39ba6)]">
            {format(t.expiresAt, { date: fmtSlot(search.expires_at) })}
          </p>
        </div>
      )}

      <form onSubmit={form.handleSubmit} noValidate className="mt-4">
        <FormFieldset
          form={form}
          name="slots"
          legend={t.slotsLabel}
          legendClassName="sr-only"
        >
          <ScrimSlotCalendarPicker
            slots={form.values.slots as string[]}
            onChange={(next) => form.setValue('slots', next)}
            accent="blue"
            maxSlots={SCRIM_SEARCH_MAX_SLOTS}
            labels={pickerLabels}
          />
        </FormFieldset>

        <div className="mt-4">
          <FormField form={form} name="note" label={t.noteLabel}>
            {(props) => (
              <input
                {...props}
                maxLength={280}
                placeholder={t.notePlaceholder}
                className={inputClass}
              />
            )}
          </FormField>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || form.isSubmitting}
          >
            {search ? t.relaunchCta : t.publishCta}
          </Button>
          {search && (
            <Button
              variant="secondary"
              disabled={busy || form.isSubmitting}
              onClick={async () => {
                if (await onClose()) form.reset({ slots: [], note: '' });
              }}
            >
              {t.closeCta}
            </Button>
          )}
        </div>
        <FormError message={form.formError} />
      </form>
    </Card>
  );
}
