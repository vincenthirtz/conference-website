// hooks/admin/useAdminForm.ts — formulaire admin sur schéma zod (lot L11,
// docs/PLAN-industrialisation-admin.md).
//
// POURQUOI. Les gros formulaires admin étaient des sacs de `useState` (45
// dans l'édition d'équipe) : valeurs, erreurs, « enregistrement… », brouillon
// et validation recodés à chaque écran, et jamais tout à fait pareil. Ici :
//
//   * les valeurs sont celles des CHAMPS (chaînes, booléens) ; le schéma les
//     transforme en corps de requête et applique les MÊMES règles que le
//     serveur (`FormSchema = z.object(champs).transform(...).pipe(Body)`) ;
//   * une erreur est rattachée à SON champ — côté client (zod) comme côté
//     serveur (`AdminHttpError.fields`, même nom de champ) ;
//   * à l'échec, le focus va sur le premier champ en erreur ;
//   * `isDirty` compare aux valeurs de départ (et non « a été touché ») :
//     retaper la valeur d'origine n'est pas une modification.
//
// Accessibilité : `field(name)` renvoie `id`, `aria-invalid` et
// `aria-describedby` ; `<FormField>` pose le `<label htmlFor>`, l'aide et
// l'erreur (`role="alert"`) avec les ids correspondants.

import { useCallback, useId, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { z } from 'zod';
import { AdminHttpError, adminErrorMessage } from '@/utils/admin/adminHttp';

type Values = Record<string, unknown>;

export type UseAdminFormOptions<S extends z.ZodType<unknown, Values>> = {
  schema: S;
  initialValues: z.input<S>;
  /** Reçoit le corps VALIDÉ ; une exception affiche l'erreur dans le formulaire. */
  onSubmit: (payload: z.output<S>) => Promise<unknown> | unknown;
  /** Message quand l'erreur n'est rattachée à aucun champ. */
  errorFallback?: string;
};

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

/** Égalité de valeurs de formulaire (scalaires, tableaux, objets simples). */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function fieldDomId(formId: string, name: string) {
  return `${formId}-${name}`;
}
export function errorDomId(formId: string, name: string) {
  return `${formId}-${name}-error`;
}
export function hintDomId(formId: string, name: string) {
  return `${formId}-${name}-hint`;
}

/** Issues zod → { champ: premier message }. */
function issuesToFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export function useAdminForm<S extends z.ZodType<unknown, Values>>(
  options: UseAdminFormOptions<S>
) {
  type In = z.input<S>;
  const {
    schema,
    onSubmit,
    errorFallback = 'Enregistrement impossible.',
  } = options;
  const formId = useId().replace(/:/g, '');

  const [initial, setInitial] = useState<In>(options.initialValues);
  const [values, setValues] = useState<In>(options.initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const isDirty = useMemo(
    () =>
      Object.keys(values as Values).some(
        (k) => !sameValue((values as Values)[k], (initial as Values)[k])
      ),
    [values, initial]
  );

  const setValue = useCallback(<K extends keyof In>(name: K, value: In[K]) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Corriger un champ efface SON erreur, pas celles des autres.
    setErrors((prev) => {
      if (!((name as string) in prev)) return prev;
      const { [name as string]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  /** Remplace valeurs ET référence (après chargement ou enregistrement). */
  const reset = useCallback(
    (next?: In) => {
      const v = next ?? values;
      setValues(v);
      setInitial(v);
      setErrors({});
      setFormError(null);
    },
    [values]
  );

  const focusFirstError = useCallback(
    (fields: Record<string, string>) => {
      const first = Object.keys(fields)[0];
      if (!first || typeof document === 'undefined') return;
      const el = document.getElementById(fieldDomId(formId, first));
      el?.focus();
    },
    [formId]
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setFormError(null);
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        const fields = issuesToFields(parsed.error);
        setErrors(fields);
        focusFirstError(fields);
        return false;
      }
      setErrors({});
      setSubmitting(true);
      try {
        await onSubmit(parsed.data as z.output<S>);
        setInitial(values);
        return true;
      } catch (err) {
        const fields = err instanceof AdminHttpError ? err.fields : null;
        const known = fields
          ? Object.fromEntries(
              Object.entries(fields).filter(([k]) => k in (values as Values))
            )
          : {};
        if (Object.keys(known).length > 0) {
          setErrors(known);
          focusFirstError(known);
        } else {
          setFormError(
            err instanceof AdminHttpError
              ? adminErrorMessage(err, err.message)
              : errorFallback
          );
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [schema, values, onSubmit, errorFallback, focusFirstError]
  );

  const field = useCallback(
    (name: keyof In & string): FieldProps => {
      const error = errors[name];
      return {
        id: fieldDomId(formId, name),
        name,
        value: String((values as Values)[name] ?? ''),
        onChange: (e) => setValue(name, e.target.value as In[typeof name]),
        'aria-invalid': Boolean(error),
        // L'aide éventuelle est ajoutée par <FormField>, qui la connaît.
        'aria-describedby': error ? errorDomId(formId, name) : undefined,
      };
    },
    [errors, formId, values, setValue]
  );

  const checkbox = useCallback(
    (name: keyof In & string): CheckboxProps => ({
      id: fieldDomId(formId, name),
      name,
      checked: Boolean((values as Values)[name]),
      onChange: (e) => setValue(name, e.target.checked as In[typeof name]),
    }),
    [formId, values, setValue]
  );

  return {
    formId,
    values,
    errors,
    formError,
    isDirty,
    isSubmitting,
    setValue,
    field,
    checkbox,
    handleSubmit,
    reset,
  };
}

/**
 * Ce qu'un composant de champs a besoin de connaître d'un formulaire, typé
 * par les NOMS de champs. Syntaxe de méthode exprès : un formulaire aux noms
 * précis reste assignable à un consommateur plus large.
 */
export interface AdminFormHandle<N extends string = string> {
  formId: string;
  errors: Record<string, string>;
  field(name: N): FieldProps;
  checkbox(name: N): CheckboxProps;
}
