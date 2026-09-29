// utils/admin/adminHttp.ts — requête authentifiée vers l'API admin, HORS
// composant (lot L10, docs/PLAN-industrialisation-admin.md).
//
// POURQUOI À CÔTÉ DE `useAdminFetch`. Une fonction de requête TanStack Query
// n'est pas un composant : elle ne peut pas appeler un hook. Le comportement
// est celui de `adminFetchJson` (Bearer de la session, redirection vers la
// connexion sur 401, erreur si `!res.ok` ou si le corps porte `error`), avec
// en plus la forme d'erreur de `defineAdminRoute` : `code`, `fields`,
// `requestId`.
//
// Les mutations reçoivent une `Idempotency-Key` générée ici (option
// `idempotent`) : `defineAdminRoute` l'honore par défaut.

import {
  ApiHttpError,
  authedRequest,
  errorMessageWithRef,
  type AuthedRequestInit,
} from '@/utils/http/authedRequest';
import type { AdminErrorCode } from './errors';

// Le transport (Bearer, 401, idempotence, lecture de l'erreur) vit dans le
// cœur commun `utils/http/authedRequest.ts`, partagé avec `playerRequest`.

export class AdminHttpError extends ApiHttpError {
  declare readonly code: AdminErrorCode | null;

  constructor(message: string, status: number, payload: unknown) {
    super(message, status, payload);
    this.name = 'AdminHttpError';
  }
}

export type AdminRequestInit = AuthedRequestInit;

export function adminRequest<T>(
  url: string,
  init: AdminRequestInit = {}
): Promise<T> {
  return authedRequest<T>(url, init, {
    defaultLoginPath: () => '/admin/login',
    makeError: (message, status, payload) =>
      new AdminHttpError(message, status, payload),
  });
}

/**
 * Message de toast pour une erreur : le libellé de l'écran, suivi de la
 * référence de la requête quand le serveur en a donné une — c'est elle qu'on
 * cherche dans les logs quand le staff signale « ça n'a pas marché ».
 */
export function adminErrorMessage(err: unknown, fallback: string): string {
  return errorMessageWithRef(err, fallback);
}
