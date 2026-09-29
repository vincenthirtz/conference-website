// features/player/team/ui/pageEditor/EditorFields.tsx — champs de l'éditeur
// de page publique (lot P10), composés du kit : `FormField` (label relié,
// aide, erreur) et la classe de champ `inputClass`. Aucune brique définie ici.

import type { ReactNode } from 'react';
import FormField, { inputClass } from '@/features/ruban/FormField';
import type { SchemaFormHandle } from '@/hooks/forms/formDom';
import type { TeamEditTexts } from '../../hooks/useTeamPageEditor';

/** Aide discrète sous un champ (compteur, format attendu). */
export function FieldNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 text-[12.5px] text-[var(--t4,#807984)]">{children}</p>
  );
}

/** Couleur hex : pastille d'aperçu, remise à zéro, bordure si invalide. */
export function ColorField({
  form,
  name,
  label,
  hint,
  valid,
  placeholder,
  onClear,
  t,
}: {
  form: SchemaFormHandle<string>;
  name: string;
  label: string;
  hint: string;
  valid: boolean;
  placeholder: string;
  onClear: () => void;
  t: TeamEditTexts;
}) {
  return (
    <FormField form={form} name={name} label={label} hint={hint}>
      {(props) => (
        <div className="flex items-center gap-2">
          <input
            type="text"
            {...props}
            aria-invalid={!valid || props['aria-invalid']}
            placeholder={placeholder}
            className={`${inputClass} font-mono`}
          />
          {valid && props.value && (
            <span
              aria-hidden
              className="inline-block h-9 w-9 shrink-0 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]"
              style={{ backgroundColor: props.value }}
            />
          )}
          {props.value && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 text-[12.5px] text-[var(--err,#ff6b6b)] hover:underline"
            >
              {t.reset}
            </button>
          )}
        </div>
      )}
    </FormField>
  );
}

/** Réseau / contact : texte court plafonné. */
export function SocialField({
  form,
  name,
  label,
  hint,
  max,
}: {
  form: SchemaFormHandle<string>;
  name: string;
  label: string;
  hint: string;
  max: number;
}) {
  return (
    <FormField form={form} name={name} label={label} hint={hint}>
      {(props) => (
        <input type="text" {...props} maxLength={max} className={inputClass} />
      )}
    </FormField>
  );
}

/** Liste déroulante d'options libellées, première option = « par défaut ». */
export function SelectField({
  form,
  name,
  label,
  hint,
  defaultLabel,
  options,
}: {
  form: SchemaFormHandle<string>;
  name: string;
  label: string;
  hint: string;
  defaultLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <FormField form={form} name={name} label={label} hint={hint}>
      {(props) => (
        <select {...props} className={inputClass}>
          <option value="">{defaultLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
