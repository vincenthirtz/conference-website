// hooks/forms/formDom.ts — ids DOM et types de props des champs d'un
// formulaire sur schéma (lot P6). Séparé de `useSchemaForm` pour que les
// champs du kit (features/ruban/FormField.tsx) n'entraînent ni le hook ni le
// client HTTP (et son client Supabase) dans les bundles qui ne l'utilisent pas.

import type { ChangeEvent } from 'react';

export type FieldProps = {
  id: string;
  name: string;
  value: string;
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
  /**
   * `aria-required` et non `required` : l'attribut natif déclencherait la
   * bulle de validation du navigateur AVANT nos messages (même règle, autre
   * texte, autre langue).
   */
  'aria-required'?: boolean;
};

export type CheckboxProps = {
  id: string;
  name: string;
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function fieldDomId(formId: string, name: string) {
  return `${formId}-${name}`;
}
export function errorDomId(formId: string, name: string) {
  return `${formId}-${name}-error`;
}
export function hintDomId(formId: string, name: string) {
  return `${formId}-${name}-hint`;
}

/**
 * Ce qu'un composant de champs a besoin de connaître d'un formulaire, typé
 * par les NOMS de champs. Syntaxe de méthode exprès : un formulaire aux noms
 * précis reste assignable à un consommateur plus large.
 */
export interface SchemaFormHandle<N extends string = string> {
  formId: string;
  errors: Record<string, string>;
  field(name: N): FieldProps;
  checkbox(name: N): CheckboxProps;
}
