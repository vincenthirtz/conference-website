// features/player/demandes/ui/formPrimitives.tsx — briques de présentation
// des formulaires « Demandes » (transfert / scrim), composées du kit
// features/ruban (lot P11 ; ex-components/player/requests).

import type { ReactNode } from 'react';
import { Button } from '@/features/ruban';
import FormField, { inputClass } from '@/features/ruban/FormField';
import type { SchemaFormHandle } from '@/hooks/forms/useSchemaForm';

/** Identifiant du bandeau d'erreur, cible des `aria-describedby`. */
export const REQUESTS_ERROR_ID = 'requests-error';

/** Libellé de section d'un widget composé (liste d'équipes, rôles…). */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--t2,#c7bfca)]">
      {children}
    </p>
  );
}

/** Message libre (≤ 1000 caractères), champ `message` du formulaire. */
export function MessageField<N extends string>({
  form,
  label,
  placeholder,
}: {
  form: SchemaFormHandle<N | 'message'>;
  label: string;
  placeholder: string;
}) {
  return (
    <FormField form={form} name="message" label={label}>
      {(props) => (
        <textarea
          {...props}
          rows={3}
          maxLength={1000}
          placeholder={placeholder}
          className={`${inputClass} resize-none`}
        />
      )}
    </FormField>
  );
}

/** Champ de recherche d'équipe ; signale l'erreur « aucune équipe choisie ». */
export function TeamSearchInput({
  value,
  onChange,
  invalid,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={invalid ? REQUESTS_ERROR_ID : undefined}
      className={`${inputClass} mb-3`}
      placeholder={placeholder}
    />
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      id={REQUESTS_ERROR_ID}
      role="alert"
      className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
    >
      {message}
    </div>
  );
}

export function SubmitButton({
  disabled,
  loading,
  label,
  loadingLabel,
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <Button
      type="submit"
      variant="primary"
      disabled={disabled}
      className="w-full"
    >
      {loading ? loadingLabel : label}
    </Button>
  );
}

/** Encadré d'information (pas d'équipe, droit manquant…). */
export function Notice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-4 py-4 text-sm text-[var(--t2,#c7bfca)]">
      <p className="mb-1 font-semibold text-[var(--t1,#f4edf7)]">{title}</p>
      {children}
    </div>
  );
}
