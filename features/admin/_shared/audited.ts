// features/admin/_shared/audited.ts — un service qui ÉCRIT rend, avec sa
// réponse, le détail de l'entrée de journal (`AuditDetails`). La route le
// passe à `ctx.audit` : c'est `defineAdminRoute` qui écrit le journal, et
// seulement si le geste a réussi.

import type {
  AdminRouteContext,
  AuditDetails,
} from '@/utils/admin/defineAdminRoute';

export type Audited<R> = { result: R; audit: AuditDetails };

/** Déroule un service « audité » : journal déclaré, réponse retournée. */
export async function audited<R>(
  ctx: AdminRouteContext,
  run: Promise<Audited<R>>
): Promise<R> {
  const { result, audit } = await run;
  ctx.audit(audit);
  return result;
}
