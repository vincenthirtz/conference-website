// features/player/scrims/ui/ScrimReportForm.tsx — saisie « nous / eux » du
// score d'un scrim. L'UI raisonne en nous / eux ; la bascule vers
// team1 / team2 est faite par l'appelant, au dernier moment.
//
// Formulaire sur schéma (`useSchemaForm`) : aucun `useState` de champ.

import { useMemo } from 'react';
import { z } from 'zod';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import FormField, { FormError, inputClass } from '@/features/ruban/FormField';
import { Button } from '@/features/ruban';
import { usePlayerErrorText } from '../../_shared/useErrorText';

export type ScrimReportTexts = {
  usLabel: string;
  themLabel: string;
  submitCta: string;
  reportHint: string;
  errorScores: string;
  errorReport: string;
};

function makeSchema(message: string) {
  const score = z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, message)
    .transform(Number);
  return z.object({ mine: score, theirs: score });
}

export default function ScrimReportForm({
  scrimId,
  t,
  onSubmit,
}: {
  scrimId: string;
  t: ScrimReportTexts;
  /** Rejette en cas d'échec : l'erreur s'affiche sous le formulaire. */
  onSubmit: (score: { mine: number; theirs: number }) => Promise<void>;
}) {
  const schema = useMemo(() => makeSchema(t.errorScores), [t.errorScores]);
  const errorText = usePlayerErrorText();
  const form = useSchemaForm({
    schema,
    initialValues: { mine: '', theirs: '' },
    onSubmit,
    errorFallback: t.errorReport,
    describeError: errorText,
  });

  return (
    <form
      onSubmit={form.handleSubmit}
      noValidate
      className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3"
      data-testid={`scrim-report-form-${scrimId}`}
    >
      <div className="w-24">
        <FormField form={form} name="mine" label={t.usLabel} required>
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              className={inputClass}
            />
          )}
        </FormField>
      </div>
      <span aria-hidden className="pb-3 text-[var(--t3,#a39ba6)]">
        –
      </span>
      <div className="w-24">
        <FormField form={form} name="theirs" label={t.themLabel} required>
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              className={inputClass}
            />
          )}
        </FormField>
      </div>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        disabled={form.isSubmitting}
      >
        {t.submitCta}
      </Button>
      <p className="basis-full text-[12px] text-[var(--t3,#a39ba6)]">
        {t.reportHint}
      </p>
      <div className="basis-full">
        <FormError message={form.formError} />
      </div>
    </form>
  );
}
