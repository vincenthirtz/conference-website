// utils/player/defineTokenRoute.ts — la route déclarative d'un JETON public
// (lot P11, docs/PLAN-industrialisation-joueur.md). Pendant de
// `defineSubjectRoute` pour les routes qu'on atteint par un lien secret :
// invitation d'équipe ou d'espace, lien d'équipe partageable.
//
// Même noyau (utils/http/defineRoute.ts) : méthodes déclarées + 405/Allow,
// validation zod, erreurs typées + `requestId`. Seule la GARDE change :
//
//   export default defineTokenRoute({
//     key: 'invitation',
//     rateLimit: { max: 20, windowMs: 60_000 },   // bucket HISTORIQUE
//     token: { from: 'query', param: 'token', isPlausible, invalid: {…} },
//     GET: tokenMethod({ session: 'none', handler: … }),
//     POST: tokenMethod({ session: 'required', handler: … }),
//   });
//
// Ordre : méthode → RATE-LIMIT (clé et plafond historiques de la route,
// AVANT tout : un balayage de jetons est plafonné même s'il n'envoie que des
// déchets) → SESSION si elle est exigée (401 d'abord : on ne dit rien du
// jeton à qui n'est pas connecté) → FORME du jeton (refus sans lecture de
// base) → session facultative → zod → handler.
//
// Le jeton N'AUTHENTIFIE JAMAIS : il désigne une invitation. Ce que le
// porteur peut faire se décide dans le service (usage unique, nominatif,
// expiration) ; la garde ne fait que refuser tôt ce qui ne peut pas être un
// jeton, et résoudre la session quand la méthode en exige une.
//
// SESSION (`session`) :
//   * `'none'`     : lecture publique, aucune session lue ;
//   * `'optional'` : session lue si présente, `ctx.user` peut être `null` ;
//   * `'required'` : 401 sans session (corps `unauthenticated` fourni par la
//     route : son code historique, `AUTH_REQUIRED`…).
// SOURCE (`sessionSource`) : `'bearer'` (défaut, espace joueuse) ou
// `'cookie-or-bearer'` — le cookie du navigateur qui a ouvert le lien
// l'emporte, un `Authorization` résiduel ne décide pas à sa place.
//
// Pas d'idempotence par défaut : l'acceptation d'un jeton est elle-même à
// usage unique (CAS / RPC atomique côté base). Pas de CSRF, comme avant.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import type { z, ZodType } from 'zod';
import { getServerClient } from '@/utils/supabase';
import { resolveUserFromToken } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger, type Logger } from '@/utils/logger';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { AdminDb } from '@/utils/admin/serviceContext';
import {
  createRoute,
  RESPONSE_SENT,
  ROUTE_METHODS,
  type RouteMethod,
} from '@/utils/http/defineRoute';

export { RESPONSE_SENT } from '@/utils/http/defineRoute';

/* -------------------------------------------------------------------------
 * Types publics
 * ---------------------------------------------------------------------- */

export type TokenSession = 'none' | 'optional' | 'required';
export type TokenSessionSource = 'bearer' | 'cookie-or-bearer';

/** Corps d'erreur HISTORIQUE d'une route (`{ error, code? }`). */
export type LegacyRefusal = { status: number; error: string; code?: string };

export type TokenSource = 'query' | 'body';

export type TokenSpec = {
  /**
   * Où lire le jeton. `body` : champ du corps JSON (POST historiques). Une
   * méthode peut le surcharger (`tokenFrom`) : GET `?token=`, POST `{ token }`.
   */
  from: TokenSource;
  /** Nom du paramètre / champ. Défaut `token`. */
  param?: string;
  /** Garde de FORME, sans base (longueur, alphabet). */
  isPlausible: (value: unknown) => boolean;
  /** Réponse quand le jeton est absent ou mal formé. */
  invalid: LegacyRefusal;
};

export type TokenRouteContext<U extends User | null> = {
  db: AdminDb;
  /** Le jeton, de forme plausible — rien de plus n'est garanti. */
  token: string;
  /** Session de l'appelant selon `session`. */
  user: U;
  requestId: string;
  logger: Logger;
};

type SessionUser<S extends TokenSession> = S extends 'required'
  ? User
  : S extends 'optional'
    ? User | null
    : null;

export type TokenMethodSpec<
  S extends TokenSession = TokenSession,
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  R = unknown,
> = {
  session: S;
  sessionSource?: TokenSessionSource;
  /** Source du jeton pour CETTE méthode (défaut : `token.from`). */
  tokenFrom?: TokenSource;
  /** Corps du 401 quand `session: 'required'` et pas de session. */
  unauthenticated?: LegacyRefusal;
  query?: QS;
  body?: BS;
  /** `Cache-Control`. Défaut `no-store` (une invitation ne se met pas en cache). */
  cache?: string | false;
  status?: number;
  idempotent?: boolean;
  handler: (args: {
    query: QS extends ZodType ? z.output<QS> : Record<string, never>;
    body: BS extends ZodType ? z.output<BS> : undefined;
    ctx: TokenRouteContext<SessionUser<S>>;
    req: NextApiRequest;
    res: NextApiResponse;
  }) => Promise<R | typeof RESPONSE_SENT> | R | typeof RESPONSE_SENT;
};

// `never` : toute signature de handler y est assignable (contravariance).
type AnyTokenMethod = Omit<TokenMethodSpec<any, any, any, any>, 'handler'> & {
  handler: (args: never) => unknown;
};

export type TokenRouteDefinition = {
  /** Identifiant stable : logs, bucket de repli. */
  key: string;
  /**
   * Plafond appliqué AVANT tout, sur le bucket `rateLimitKey` (défaut `key`)
   * — celui que la route utilisait avant migration, partagé par ses méthodes.
   */
  rateLimit: { max: number; windowMs: number };
  rateLimitKey?: string;
  token: TokenSpec;
  GET?: AnyTokenMethod;
  POST?: AnyTokenMethod;
  PUT?: AnyTokenMethod;
  PATCH?: AnyTokenMethod;
  DELETE?: AnyTokenMethod;
};

/** Métadonnées exposées (matrice de permissions, contrat OpenAPI). */
export type TokenRouteMeta = {
  key: string;
  token: { param: string };
  methods: Partial<
    Record<
      RouteMethod,
      {
        session: TokenSession;
        tokenFrom: TokenSource;
        idempotent: boolean;
        query?: ZodType;
        body?: ZodType;
      }
    >
  >;
};

export type TokenRouteHandler = ((
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void>) & { tokenRoute: TokenRouteMeta };

/** Déclare une méthode avec inférence de la session, de `query` et `body`. */
export function tokenMethod<
  S extends TokenSession,
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  R = unknown,
>(spec: TokenMethodSpec<S, QS, BS, R>): TokenMethodSpec<S, QS, BS, R> {
  return spec;
}

/* -------------------------------------------------------------------------
 * Implémentation
 * ---------------------------------------------------------------------- */

type Principal = { token: string; user: User | null };

function readToken(
  req: NextApiRequest,
  spec: TokenSpec,
  from: TokenSource
): unknown {
  const name = spec.param ?? 'token';
  if (from === 'body') {
    const body = req.body;
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)[name]
      : undefined;
  }
  const raw = req.query?.[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function bearerOf(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/** Session de l'appelant selon la source déclarée ; `null` si aucune. */
async function resolveSession(
  req: NextApiRequest,
  res: NextApiResponse,
  source: TokenSessionSource
): Promise<User | null> {
  if (source === 'cookie-or-bearer') {
    const {
      data: { user },
    } = await getServerClient(req, res).auth.getUser();
    if (user) return user;
  }
  const bearer = bearerOf(req);
  return bearer ? await resolveUserFromToken(bearer) : null;
}

function refuse(r: LegacyRefusal): LegacyAdminError {
  return new LegacyAdminError(
    r.status,
    r.error,
    r.code ? { code: r.code } : {}
  );
}

/** Refus par défaut : celui de `withAuthRoute`, que ces routes utilisaient. */
function defaultUnauthenticated(req: NextApiRequest): LegacyRefusal {
  return {
    status: 401,
    error: bearerOf(req) ? 'Not authenticated.' : 'Token required.',
  };
}

export function defineTokenRoute(def: TokenRouteDefinition): TokenRouteHandler {
  const meta: TokenRouteMeta = {
    key: def.key,
    token: { param: def.token.param ?? 'token' },
    methods: {},
  };
  const methods: Partial<Record<RouteMethod, AnyTokenMethod>> = {};

  for (const m of ROUTE_METHODS) {
    const spec = def[m];
    if (!spec) continue;
    // Le noyau pose `Cache-Control` : une invitation n'est jamais mise en cache.
    methods[m] = {
      ...spec,
      cache: spec.cache ?? 'no-store',
      // Le plafond est appliqué par la garde, avant la forme du jeton.
      rateLimit: false,
    } as AnyTokenMethod;
    meta.methods[m] = {
      session: spec.session,
      tokenFrom: spec.tokenFrom ?? def.token.from,
      idempotent: m !== 'GET' && spec.idempotent === true,
      query: spec.query,
      body: spec.body,
    };
  }

  const route = createRoute<Principal, AnyTokenMethod, object>(
    def.key,
    methods,
    {
      namespace: 'token',
      csrf: false,
      authorize: async (req, res, method, spec) => {
        if (
          applyRateLimit(req, res, def.rateLimit, def.rateLimitKey ?? def.key)
        ) {
          return RESPONSE_SENT;
        }
        const source = spec.sessionSource ?? 'bearer';
        let user: User | null = null;
        if (spec.session === 'required') {
          user = await resolveSession(req, res, source);
          if (!user) {
            throw refuse(spec.unauthenticated ?? defaultUnauthenticated(req));
          }
        }
        const token = readToken(
          req,
          def.token,
          meta.methods[method]!.tokenFrom
        );
        if (!def.token.isPlausible(token)) throw refuse(def.token.invalid);
        if (spec.session === 'optional') {
          user = await resolveSession(req, res, source);
        }
        return { token: token as string, user };
      },
      idempotent: (method) => meta.methods[method]!.idempotent,
      idempotencyScope: ({ user }) => ({
        actorId: user?.id ?? 'anonymous',
        tenantId: 'token',
      }),
      context: ({ token, user }, base) => ({
        db: base.db,
        token,
        user,
        requestId: base.requestId,
        logger,
      }),
    }
  );

  return Object.assign(route, { tokenRoute: meta });
}
