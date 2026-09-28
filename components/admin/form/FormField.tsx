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

export const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm aria-[invalid=true]:border-red-500';

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
      <label htmlFor={props.id} className="block text-sm text-neutral-300 mb-1">
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
          className="text-xs text-neutral-500 mt-1"
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorDomId(formId, name)}
          role="alert"
          className="text-xs text-red-400 mt-1"
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
