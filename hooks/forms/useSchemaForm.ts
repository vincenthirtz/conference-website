// hooks/forms/useSchemaForm.ts — formulaire sur schéma zod, commun à l'admin
// et à l'espace joueuse (lot P6, docs/PLAN-industrialisation-joueur.md ;
// généralise `useAdminForm`, lot L11 de l'industrialisation admin).
//
// POURQUOI. Les gros formulaires étaient des sacs de `useState` : valeurs,
// erreurs, « enregistrement… », brouillon et validation recodés à chaque
// écran, et jamais tout à fait pareil. Ici :
//
//   * les valeurs sont celles des CHAMPS (chaînes, booléens, listes) ; le
//     schéma les transforme en corps de requête et applique les MÊMES règles
//     que le serveur (`FormSchema = z.object(champs).transform(...).pipe(Body)`,
//     `Body` = le schéma partagé de la route, `features/<surface>/*/schemas.ts`) ;
//   * une erreur est rattachée à SON champ — côté client (zod) comme côté
//     serveur (`ApiHttpError.fields`, même nom de champ ; une liste de messages
//     `flatten().fieldErrors` garde le premier) ;
//   * à l'échec, le focus va sur le premier champ en erreur ;
//   * `isDirty` compare aux valeurs de départ (et non « a été touché ») :
//     retaper la valeur d'origine n'est pas une modification ;
//   * l'erreur non rattachée passe par `describeError` : la joueuse y branche
//     le résolveur traduit par `code` (`usePlayerErrorText`, lot P4) ;
//   * `unsavedChangesMessage` arme la garde « quitter sans enregistrer ».
//
// Accessibilité : `field(name)` renvoie `id`, `aria-invalid` et
// `aria-describedby` ; `<FormField>` / `<FormFieldset>` (features/ruban) posent
// le `<label htmlFor>` / `<legend>`, l'aide et l'erreur (`role="alert"`).

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { z } from 'zod';
import { ApiHttpError, errorMessageWithRef } from '@/utils/http/authedRequest';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import {
  fieldDomId,
  errorDomId,
  type CheckboxProps,
  type FieldProps,
} from './formDom';

type Values = Record<string, unknown>;

export type UseSchemaFormOptions<S extends z.ZodType<unknown, Values>> = {
  schema: S;
  initialValues: z.input<S>;
  /** Reçoit le corps VALIDÉ ; une exception affiche l'erreur dans le formulaire. */
  onSubmit: (payload: z.output<S>) => Promise<unknown> | unknown;
  /** Message quand l'erreur n'est rattachée à aucun champ ni reconnue. */
  errorFallback?: string;
  /**
   * Message d'une erreur non rattachée à un champ. Défaut : texte serveur
   * d'une `ApiHttpError` suivi de sa référence, sinon `errorFallback`.
   */
  describeError?: (err: unknown, fallback: string) => string;
  /** Erreurs par champ portées par une erreur (défaut : `ApiHttpError.fields`). */
  fieldErrorsOf?: (err: unknown) => Record<string, unknown> | null;
  /** Arme la garde de navigation tant que le formulaire est modifié. */
  unsavedChangesMessage?: string;
};

export {
  errorDomId,
  fieldDomId,
  hintDomId,
  type CheckboxProps,
  type FieldProps,
  type SchemaFormHandle,
} from './formDom';

/** Égalité de valeurs de formulaire (scalaires, tableaux, objets simples). */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

/** `{ champ: 'msg' }` ou `{ champ: ['msg', …] }` (zod `flatten`) → premier message. */
function firstMessage(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === 'string' && x);
    return typeof s === 'string' ? s : null;
  }
  return null;
}

const defaultFieldErrorsOf = (err: unknown) =>
  err instanceof ApiHttpError ? err.fields : null;

const defaultDescribeError = (err: unknown, fallback: string) =>
  err instanceof ApiHttpError
    ? errorMessageWithRef(err, err.message)
    : fallback;

export function useSchemaForm<S extends z.ZodType<unknown, Values>>(
  options: UseSchemaFormOptions<S>
) {
  type In = z.input<S>;
  const {
    schema,
    onSubmit,
    errorFallback = 'Enregistrement impossible.',
    describeError = defaultDescribeError,
    fieldErrorsOf = defaultFieldErrorsOf,
    unsavedChangesMessage,
  } = options;
  const formId = useId().replace(/:/g, '');

  const [initial, setInitial] = useState<In>(options.initialValues);
  const [values, setValues] = useState<In>(options.initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  // Incrémenté par `reset` : un `onSubmit` qui réaffiche la réponse du
  // SERVEUR (`reset(réponse)`) ne doit pas être écrasé par les valeurs envoyées.
  const resetGen = useRef(0);

  const isDirty = useMemo(
    () =>
      Object.keys(values as Values).some(
        (k) => !sameValue((values as Values)[k], (initial as Values)[k])
      ),
    [values, initial]
  );

  useUnsavedChangesGuard(
    Boolean(unsavedChangesMessage) && isDirty,
    unsavedChangesMessage
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
      resetGen.current += 1;
      setValues(v);
      setInitial(v);
      setErrors({});
      setFormError(null);
    },
    [values]
  );

  /** Revient aux valeurs de départ (bouton « Annuler »), sans relire le serveur. */
  const revert = useCallback(() => {
    setValues(initial);
    setErrors({});
    setFormError(null);
  }, [initial]);

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
      const gen = resetGen.current;
      try {
        await onSubmit(parsed.data as z.output<S>);
        if (resetGen.current === gen) setInitial(values);
        return true;
      } catch (err) {
        const known: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldErrorsOf(err) ?? {})) {
          const msg = firstMessage(v);
          if (msg && k in (values as Values)) known[k] = msg;
        }
        if (Object.keys(known).length > 0) {
          setErrors(known);
          focusFirstError(known);
        } else {
          setFormError(describeError(err, errorFallback));
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [
      schema,
      values,
      onSubmit,
      errorFallback,
      describeError,
      fieldErrorsOf,
      focusFirstError,
    ]
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
    revert,
  };
}
