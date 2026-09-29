// utils/player/definePublicRoute.ts — la route déclarative ANONYME du
// parcours joueuse (lot P11, docs/PLAN-industrialisation-joueur.md) :
// création d'équipe depuis le site public, sans compte.
//
// Même noyau (utils/http/defineRoute.ts) : méthodes déclarées + 405/Allow,
// validation zod, erreurs typées + `requestId`. Seule la GARDE change — il
// n'y a personne à authentifier, donc elle PROTÈGE :
//
//   export default definePublicRoute({
//     key: 'create-team',
//     rateLimits: [
//       { max: 3, windowMs: 5 * 60_000, key: 'create-team-burst' },
//       { max: 5, windowMs: 60 * 60_000, key: 'create-team' },
//     ],
//     antiBot: true,
//     tenant: 'public',
//     POST: publicMethod({ body: CreateTeamBody, status: 201, handler: … }),
//   });
//
// Ordre : méthode → RATE-LIMITS (dans l'ordre déclaré, buckets historiques ;
// le premier atteint répond 429) → base indisponible (503 au code historique
// `SERVICE_UNAVAILABLE`) → ANTI-BOT : honeypot puis captcha HMAC, AVANT toute
// résolution ou création de compte (un bot ne déclenche ni compte ni e-mail
// sans résoudre le défi) → tenant public → zod → handler.
//
// Pas d'idempotence (pas d'acteur à qui la rattacher : le captcha est déjà à
// usage unique) ; pas de CSRF (aucune session à détourner).

import type { NextApiRequest, NextApiResponse } from 'next';
import type { z, ZodType } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
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

export type PublicRateLimit = { max: number; windowMs: number; key: string };

export type PublicRouteContext = {
  db: AdminDb;
  /** Tenant résolu pour une requête publique (domaine, en-tête, défaut). */
  tenantId: string;
  requestId: string;
  logger: Logger;
};

export type PublicMethodSpec<
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  R = unknown,
> = {
  query?: QS;
  body?: BS;
  cache?: string | false;
  status?: number;
  handler: (args: {
    query: QS extends ZodType ? z.output<QS> : Record<string, never>;
    body: BS extends ZodType ? z.output<BS> : undefined;
    ctx: PublicRouteContext;
    req: NextApiRequest;
    res: NextApiResponse;
  }) => Promise<R | typeof RESPONSE_SENT> | R | typeof RESPONSE_SENT;
};

// `never` : toute signature de handler y est assignable (contravariance).
type AnyPublicMethod = Omit<PublicMethodSpec<any, any, any>, 'handler'> & {
  handler: (args: never) => unknown;
};

export type PublicRouteDefinition = {
  key: string;
  /** Plafonds appliqués AVANT tout, dans l'ordre (buckets historiques). */
  rateLimits: PublicRateLimit[];
  /**
   * Honeypot (`honeypot`) + captcha HMAC (`captchaToken` / `captchaAnswer`,
   * défi de GET /api/captcha) lus dans le corps brut.
   */
  antiBot: boolean;
  GET?: AnyPublicMethod;
  POST?: AnyPublicMethod;
  PUT?: AnyPublicMethod;
  PATCH?: AnyPublicMethod;
  DELETE?: AnyPublicMethod;
};

export type PublicRouteMeta = {
  key: string;
  antiBot: boolean;
  methods: Partial<
    Record<RouteMethod, { idempotent: false; query?: ZodType; body?: ZodType }>
  >;
};

export type PublicRouteHandler = ((
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void>) & { publicRoute: PublicRouteMeta };

/** Déclare une méthode avec inférence de `query` et `body`. */
export function publicMethod<
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  R = unknown,
>(spec: PublicMethodSpec<QS, BS, R>): PublicMethodSpec<QS, BS, R> {
  return spec;
}

/* -------------------------------------------------------------------------
 * Implémentation
 * ---------------------------------------------------------------------- */

function bodyField(req: NextApiRequest, name: string): unknown {
  const body = req.body;
  return body && typeof body === 'object'
    ? (body as Record<string, unknown>)[name]
    : undefined;
}

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Honeypot puis captcha — refus aux codes historiques du parcours. */
async function assertHuman(req: NextApiRequest): Promise<void> {
  const honeypot = bodyField(req, 'honeypot');
  if (honeypot && asText(honeypot).trim().length > 0) {
    throw new LegacyAdminError(400, 'Bot detected', { code: 'HONEYPOT' });
  }
  const result = await verifyCaptcha(
    asText(bodyField(req, 'captchaToken') || ''),
    asText(bodyField(req, 'captchaAnswer') || '')
  );
  if (!result.valid) {
    throw new LegacyAdminError(400, result.error || 'Captcha invalide', {
      code: 'CAPTCHA_INVALID',
    });
  }
}

type Principal = { tenantId: string };

export function definePublicRoute(
  def: PublicRouteDefinition
): PublicRouteHandler {
  const meta: PublicRouteMeta = {
    key: def.key,
    antiBot: def.antiBot,
    methods: {},
  };
  const methods: Partial<Record<RouteMethod, AnyPublicMethod>> = {};

  for (const m of ROUTE_METHODS) {
    const spec = def[m];
    if (!spec) continue;
    // Les plafonds sont appliqués par la garde, avant tout le reste.
    methods[m] = { ...spec, rateLimit: false } as AnyPublicMethod;
    meta.methods[m] = {
      idempotent: false,
      query: spec.query,
      body: spec.body,
    };
  }

  const route = createRoute<Principal, AnyPublicMethod, object>(
    def.key,
    methods,
    {
      namespace: 'public',
      csrf: false,
      authorize: async (req, res) => {
        for (const limit of def.rateLimits) {
          if (applyRateLimit(req, res, limit, limit.key)) return RESPONSE_SENT;
        }
        if (!supabaseAdmin) {
          throw new LegacyAdminError(503, 'Service unavailable.', {
            code: 'SERVICE_UNAVAILABLE',
          });
        }
        if (def.antiBot) await assertHuman(req);
        return { tenantId: await resolveTenantIdForPublicRequestAsync(req) };
      },
      idempotent: () => false,
      idempotencyScope: ({ tenantId }) => ({ actorId: 'public', tenantId }),
      context: ({ tenantId }, base): PublicRouteContext => ({
        db: base.db,
        tenantId,
        requestId: base.requestId,
        logger,
      }),
    }
  );

  return Object.assign(route, { publicRoute: meta });
}
