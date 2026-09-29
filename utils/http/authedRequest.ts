// utils/http/authedRequest.ts — cœur commun des clients HTTP HORS composant
// (`adminRequest` du lot L10, `playerRequest` du lot P5 joueuse).
//
// POURQUOI UN CŒUR. Les deux espaces parlent au même noyau serveur
// (`utils/http/defineRoute.ts`) : même Bearer, même forme d'erreur
// `{ error, code, fields?, requestId }`, même idempotence par défaut sur les
// mutations. Seuls changent la page de connexion (401) et la classe d'erreur
// levée — l'appelant les fournit. Une fonction de requête TanStack Query
// n'étant pas un composant, rien ici n'est un hook.

import Router from 'next/router';
import { supabaseClient } from '@/utils/supabaseBrowser';

/** Corps d'erreur du noyau `defineRoute` (admin comme joueuse). */
type ErrorBody = {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
  reason?: string;
  requestId?: string;
};

/**
 * Erreur HTTP typée. `AdminHttpError` et `PlayerHttpError` en héritent : une
 * politique de cache (« pas de nouvel essai sur 4xx ») peut tester la base.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly fields: Record<string, string> | null;
  readonly reason: string | null;
  readonly requestId: string | null;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.payload = payload;
    const body = (payload ?? {}) as ErrorBody;
    this.code = body.code ?? null;
    this.fields = body.fields ?? null;
    this.reason = body.reason ?? null;
    this.requestId = body.requestId ?? null;
  }
}

export type AuthedRequestInit = Omit<RequestInit, 'body'> & {
  /** Sérialisé en JSON. */
  json?: unknown;
  /** Ajoute une `Idempotency-Key` fraîche (mutations). */
  idempotent?: boolean;
  /** Ne pas rediriger vers la connexion sur 401. */
  skipAuthRedirect?: boolean;
  loginPath?: string;
};

export type AuthedRequestConfig = {
  /** Page de connexion quand l'appel n'en précise pas (lue au moment du 401). */
  defaultLoginPath: () => string;
  makeError: (message: string, status: number, payload: unknown) => Error;
};

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function authedRequest<T>(
  url: string,
  init: AuthedRequestInit,
  config: AuthedRequestConfig
): Promise<T> {
  const {
    json,
    idempotent,
    skipAuthRedirect,
    loginPath,
    headers: rawHeaders,
    ...rest
  } = init;

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) throw config.makeError('Session manquante.', 401, null);

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
    void Router.replace(loginPath ?? config.defaultLoginPath());
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
    throw config.makeError(
      errMsg || `Requête échouée (${res.status})`,
      res.status,
      payload
    );
  }
  return payload as T;
}

/**
 * Libellé d'erreur suivi de la référence de la requête quand le serveur en a
 * donné une — c'est elle qu'on cherche dans les logs.
 */
export function errorMessageWithRef(err: unknown, fallback: string): string {
  const ref =
    err instanceof ApiHttpError && err.requestId
      ? ` (réf. ${err.requestId.slice(0, 8)})`
      : '';
  return `${fallback}${ref}`;
}
