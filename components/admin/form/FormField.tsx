// components/admin/form/FormField.tsx — un champ de formulaire admin
// accessible (lot L11, docs/PLAN-industrialisation-admin.md).
//
// Le label est RELIÉ au champ (`htmlFor`), l'aide et l'erreur le sont par
// `aria-describedby`, l'erreur est annoncée (`role="alert"`). Les formulaires
// d'avant posaient des `<label>` flottants que les lecteurs d'écran ne
// rattachaient à rien.
//
//   <FormField form={form} name="label" label="Nom affiché" required>
//     {(props) => <input type="text" {...props} className={inputClass} />}
//   </FormField>

import type { ReactNode } from 'react';
import {
  errorDomId,
  hintDomId,
  type AdminFormHandle,
  type FieldProps,
} from '@/hooks/admin/useAdminForm';

/** Champ de la planche « AdminFiches » : 44 px, fond s2, trait, rayon 4 px. */
export const inputClass =
  'w-full min-h-11 px-3.5 py-2.5 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-[15px] text-[var(--t1,#f4edf7)] focus:outline-none focus:border-[var(--or,#b467d1)] aria-[invalid=true]:border-[var(--err,#ff6b6b)]';

type Props<N extends string> = {
  form: AdminFormHandle<N>;
  /** Déduit du FORMULAIRE (`NoInfer`) : un nom inconnu ne compile pas. */
  name: NoInfer<N>;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: (props: FieldProps) => ReactNode;
};

export default function FormField<N extends string>({
  form,
  name,
  label,
  hint,
  required,
  children,
}: Props<N>) {
  const { formId } = form;
  const base = form.field(name);
  const error = form.errors[name];
  const describedBy = [
    hint ? hintDomId(formId, name) : null,
    error ? errorDomId(formId, name) : null,
  ]
    .filter(Boolean)
    .join(' ');
  const props: FieldProps = {
    ...base,
    'aria-describedby': describedBy || undefined,
    ...(required ? { 'aria-required': true } : {}),
  };

  return (
    <div>
      <label
        htmlFor={props.id}
        className="mb-2 block font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t3,#a39ba6)] [font-stretch:75%]"
      >
        {label}
        {required && (
          <span className="text-red-400" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children(props)}
      {hint && (
        <p
          id={hintDomId(formId, name)}
          className="mt-1.5 text-[12.5px] text-[var(--t4,#807984)]"
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorDomId(formId, name)}
          role="alert"
          className="mt-1.5 text-[12.5px] text-[var(--err,#ff6b6b)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Erreur de formulaire non rattachée à un champ (réseau, serveur…). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm"
    >
      {message}
    </div>
  );
}
