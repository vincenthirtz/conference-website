// cloudflare/identityReader.ts — le lecteur de Better Auth pour la porte du site.
//
// La porte (utils/identity.ts, recopiée de l'API) cherche sur globalThis un lecteur qui
// vérifie un jeton Better Auth et lit la session de son cookie (lot 6 de
// docs/AUTH-BETTER-AUTH.md). Côté API, c'est Better Auth lui-même ; ici, le site n'a ni la
// base des comptes ni aucun secret de Better Auth : il demande à l'API, par la liaison
// API_WORKER, GET /api/identity-session, avec le cookie ou le jeton de la visite.
//
// Sans liaison ou sans secret de relais, pas de lecteur : la porte refuse alors tout jeton
// Better Auth et ignore son cookie, comme avant le lot 6. Une panne de l'API rend `null` :
// la personne n'est pas reconnue, elle n'est jamais prise pour une autre.
//
// cloudflare/worker.mjs le repose à chaque requête : il porte l'adresse et l'hôte de la
// visite, que l'API journalise. Deux rendus simultanés peuvent s'échanger ces deux valeurs,
// jamais un cookie ni un jeton, qui sont passés à chaque appel.

import { buildUpstreamHeaders } from '../utils/edgeApiProxy.ts';

/** Lu par utils/identity.ts. */
export const IDENTITY_BACKEND = Symbol.for('owwc.identity.backend');

const SESSION_PATH = '/api/identity-session';

export type IdentitySession = {
  id: string;
  aal: 'aal1' | 'aal2';
  accessToken: string | null;
};

type ApiBinding = {
  fetch(input: string, init?: RequestInit): Promise<Response>;
};

export type IdentityReaderContext = {
  /** Origine de l'API vue par la liaison (API_PROXY_ORIGIN). */
  origin: string;
  /** EDGE_PROXY_SECRET : sans lui, l'API ne croit ni l'adresse ni l'hôte. */
  secret: string;
  clientIp: string | undefined;
  host: string;
};

function isSession(value: unknown): value is IdentitySession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    (v.aal === 'aal1' || v.aal === 'aal2')
  );
}

export function createIdentityReader(
  api: ApiBinding,
  context: IdentityReaderContext
) {
  async function ask(
    credentials: Record<string, string>
  ): Promise<IdentitySession | null> {
    try {
      const res = await api.fetch(`${context.origin}${SESSION_PATH}`, {
        headers: buildUpstreamHeaders(new Headers(credentials), {
          secret: context.secret,
          clientIp: context.clientIp,
          host: context.host,
        }),
      });
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }
      const body: unknown = await res.json();
      return isSession(body) ? body : null;
    } catch {
      return null;
    }
  }

  return {
    userFromToken: (token: string) => ask({ authorization: `Bearer ${token}` }),
    sessionFromCookies: (cookieHeader: string) => ask({ cookie: cookieHeader }),
  };
}

/** Pose le lecteur pour la requête en cours, ou le retire sans liaison ou sans secret. */
export function bindIdentityReader(
  api: ApiBinding | undefined,
  context: IdentityReaderContext | null
): void {
  const store = globalThis as unknown as Record<symbol, unknown>;
  if (!api || !context?.secret) {
    delete store[IDENTITY_BACKEND];
    return;
  }
  store[IDENTITY_BACKEND] = createIdentityReader(api, context);
}
