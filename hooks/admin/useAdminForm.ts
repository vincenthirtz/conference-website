// hooks/admin/useAdminForm.ts — formulaire admin sur schéma zod (lot L11,
// docs/PLAN-industrialisation-admin.md).
//
// Depuis le lot P6 (docs/PLAN-industrialisation-joueur.md), le moteur est
// commun : `hooks/forms/useSchemaForm.ts`. Ce fichier n'en est que l'ADAPTATEUR
// admin, au comportement inchangé :
//
//   * seule une `AdminHttpError` porte des erreurs par champ ;
//   * l'erreur non rattachée affiche le texte serveur + la référence d'une
//     `AdminHttpError`, sinon `errorFallback` ;
//   * pas de garde de navigation implicite : les fiches admin appellent
//     `useUnsavedChangesGuard(form.isDirty)` elles-mêmes.

import type { z } from 'zod';
import { AdminHttpError, adminErrorMessage } from '@/utils/admin/adminHttp';
import {
  useSchemaForm,
  type SchemaFormHandle,
} from '@/hooks/forms/useSchemaForm';

export {
  errorDomId,
  fieldDomId,
  hintDomId,
  type CheckboxProps,
  type FieldProps,
} from '@/hooks/forms/useSchemaForm';

type Values = Record<string, unknown>;

export type UseAdminFormOptions<S extends z.ZodType<unknown, Values>> = {
  schema: S;
  initialValues: z.input<S>;
  /** Reçoit le corps VALIDÉ ; une exception affiche l'erreur dans le formulaire. */
  onSubmit: (payload: z.output<S>) => Promise<unknown> | unknown;
  /** Message quand l'erreur n'est rattachée à aucun champ. */
  errorFallback?: string;
};

const adminFieldErrorsOf = (err: unknown) =>
  err instanceof AdminHttpError ? err.fields : null;

const adminDescribeError = (err: unknown, fallback: string) =>
  err instanceof AdminHttpError
    ? adminErrorMessage(err, err.message)
    : fallback;

export function useAdminForm<S extends z.ZodType<unknown, Values>>(
  options: UseAdminFormOptions<S>
) {
  return useSchemaForm({
    ...options,
    fieldErrorsOf: adminFieldErrorsOf,
    describeError: adminDescribeError,
  });
}

/** Alias admin de `SchemaFormHandle`. */
export type AdminFormHandle<N extends string = string> = SchemaFormHandle<N>;
