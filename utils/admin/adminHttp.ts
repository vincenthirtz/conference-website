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

import Router from 'next/router';
import { supabaseClient } from '@/utils/supabaseBrowser';
import type { AdminErrorBody, AdminErrorCode } from './errors';

export class AdminHttpError extends Error {
  readonly status: number;
  readonly code: AdminErrorCode | null;
  readonly fields: Record<string, string> | null;
  readonly reason: string | null;
  readonly requestId: string | null;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'AdminHttpError';
    this.status = status;
    this.payload = payload;
    const body = (payload ?? {}) as Partial<AdminErrorBody>;
    this.code = body.code ?? null;
    this.fields = body.fields ?? null;
    this.reason = body.reason ?? null;
    this.requestId = body.requestId ?? null;
  }
}

export type AdminRequestInit = Omit<RequestInit, 'body'> & {
  /** Sérialisé en JSON. */
  json?: unknown;
  /** Ajoute une `Idempotency-Key` fraîche (mutations). */
  idempotent?: boolean;
  /** Ne pas rediriger vers la connexion sur 401. */
  skipAuthRedirect?: boolean;
  loginPath?: string;
};

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function adminRequest<T>(
  url: string,
  init: AdminRequestInit = {}
): Promise<T> {
  const {
    json,
    idempotent,
    skipAuthRedirect,
    loginPath = '/admin/login',
    headers: rawHeaders,
    ...rest
  } = init;

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new AdminHttpError('Session manquante.', 401, null);

  const headers = new Headers(rawHeaders);
  headers.set('Authorization', `Bearer ${token}`);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  if (idempotent && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', newKey());
  }

  const res = await fetch(url, {
    credentials: 'same-origin',
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (res.status === 401 && !skipAuthRedirect) {
    void Router.replace(loginPath);
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const errMsg =
    payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : null;
  if (!res.ok || errMsg) {
    throw new AdminHttpError(
      errMsg || `Requête échouée (${res.status})`,
      res.status,
      payload
    );
  }
  return payload as T;
}

/**
 * Message de toast pour une erreur : le libellé de l'écran, suivi de la
 * référence de la requête quand le serveur en a donné une — c'est elle qu'on
 * cherche dans les logs quand le staff signale « ça n'a pas marché ».
 */
export function adminErrorMessage(err: unknown, fallback: string): string {
  const ref =
    err instanceof AdminHttpError && err.requestId
      ? ` (réf. ${err.requestId.slice(0, 8)})`
      : '';
  return `${fallback}${ref}`;
}
