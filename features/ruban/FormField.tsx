// features/ruban/FormField.tsx — champs de formulaire accessibles du kit
// « Le Ruban », communs à l'admin et à l'espace joueuse (lot L11 admin,
// déplacé dans le kit au lot P6 ; components/admin/form/FormField.tsx
// ré-exporte).
//
// Le label est RELIÉ au champ (`htmlFor`), l'aide et l'erreur le sont par
// `aria-describedby`, l'erreur est annoncée (`role="alert"`). La DENSITÉ vient
// de la surface (styles/player-ruban.css : cibles 44 px, corps 16 px), pas
// d'une variante de composant.
//
//   <FormField form={form} name="label" label="Nom affiché" required>
//     {(props) => <input type="text" {...props} className={inputClass} />}
//   </FormField>
//
// `FormFieldset` rattache une erreur à un champ COMPOSÉ (liste de choix,
// groupe de cases) : le `<fieldset>` porte l'id du champ et reçoit le focus
// quand `useSchemaForm` y envoie la première erreur.

import type { ReactNode } from 'react';
import {
  errorDomId,
  fieldDomId,
  hintDomId,
  type FieldProps,
  type SchemaFormHandle,
} from '@/hooks/forms/formDom';

/** Champ de la planche « Fiches » : 44 px, fond s2, trait, rayon 4 px. */
export const inputClass =
  'w-full min-h-11 px-3.5 py-2.5 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-[15px] text-[var(--t1,#f4edf7)] focus:outline-none focus:border-[var(--or,#b467d1)] aria-[invalid=true]:border-[var(--err,#ff6b6b)]';

const labelClass =
  'mb-2 block font-[family-name:var(--fd,Archivo,sans-serif)] text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

function describedBy(
  formId: string,
  name: string,
  hint: boolean,
  error: boolean
) {
  return (
    [
      hint ? hintDomId(formId, name) : null,
      error ? errorDomId(formId, name) : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-[12.5px] text-[var(--t4,#807984)]">
      {children}
    </p>
  );
}

function FieldErrorText({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 text-[12.5px] text-[var(--err,#ff6b6b)]"
    >
      {message}
    </p>
  );
}

type Props<N extends string> = {
  form: SchemaFormHandle<N>;
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
  const props: FieldProps = {
    ...base,
    'aria-describedby': describedBy(
      formId,
      name,
      Boolean(hint),
      Boolean(error)
    ),
    ...(required ? { 'aria-required': true } : {}),
  };

  return (
    <div>
      <label htmlFor={props.id} className={labelClass}>
        {label}
        {required && (
          <span className="text-[var(--err,#ff6b6b)]" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children(props)}
      {hint && <Hint id={hintDomId(formId, name)}>{hint}</Hint>}
      {error && (
        <FieldErrorText id={errorDomId(formId, name)} message={error} />
      )}
    </div>
  );
}

type FieldsetProps<N extends string> = {
  form: SchemaFormHandle<N>;
  name: NoInfer<N>;
  legend: ReactNode;
  hint?: ReactNode;
  className?: string;
  legendClassName?: string;
  hintClassName?: string;
  children: ReactNode;
};

/** Champ composé (liste, groupe) : légende, aide et erreur reliées au groupe. */
export function FormFieldset<N extends string>({
  form,
  name,
  legend,
  hint,
  className,
  legendClassName = labelClass,
  hintClassName,
  children,
}: FieldsetProps<N>) {
  const { formId } = form;
  const error = form.errors[name];
  return (
    <fieldset
      id={fieldDomId(formId, name)}
      // Cible du focus « première erreur », sans entrer dans l'ordre Tab.
      tabIndex={-1}
      aria-describedby={describedBy(
        formId,
        name,
        Boolean(hint),
        Boolean(error)
      )}
      className={className}
    >
      <legend className={legendClassName}>{legend}</legend>
      {hint &&
        (hintClassName ? (
          <p id={hintDomId(formId, name)} className={hintClassName}>
            {hint}
          </p>
        ) : (
          <Hint id={hintDomId(formId, name)}>{hint}</Hint>
        ))}
      {children}
      {error && (
        <FieldErrorText id={errorDomId(formId, name)} message={error} />
      )}
    </fieldset>
  );
}

/** Erreur de formulaire non rattachée à un champ (réseau, serveur…). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-[var(--r-ctrl,4px)] bg-[rgba(255,107,107,.08)] border border-[rgba(255,107,107,.4)] px-4 py-3 text-sm text-[#ffc2c2]"
    >
      {message}
    </div>
  );
}
