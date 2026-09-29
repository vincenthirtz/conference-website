// utils/http/defineRoute.ts — le NOYAU des routes déclaratives (lot P3,
// docs/PLAN-industrialisation-joueur.md).
//
// Extrait de `utils/admin/defineAdminRoute.ts` (lot L3 de l'admin) : tout ce
// qui ne dépend PAS de qui appelle. Une « garde » (staff, sujet…) branche
// dessus sa résolution d'identité, son contexte et son journal :
//
//   defineAdminRoute   (utils/admin/defineAdminRoute.ts)   garde staff + CSRF
//   defineSubjectRoute (utils/player/defineSubjectRoute.ts) garde sujet (Bearer)
//
// Pipeline, identique pour toutes les gardes :
//   méthode déclarée ? (405 + Allow) → Cache-Control → CSRF (si la garde
//   l'exige) → garde → rate-limit → base disponible ? → idempotence
//   → validation (query, body) → handler → réponse → `afterResponse`.
//
// Ce que le noyau garantit sans que la route y pense :
//   * `X-Request-Id` sur chaque réponse, repris dans le corps des erreurs ;
//   * 405 + `Allow` sur une méthode non déclarée ;
//   * rate-limit par défaut (lecture 120/min, écriture 60/min par IP) ;
//   * `Cache-Control: private, no-store` par défaut ;
//   * toute erreur au format `{ error, code, fields?, requestId }` ;
//   * l'`afterResponse` (journal) ne tourne qu'après une réponse réussie, et
//     une panne de journal ne transforme pas un succès en erreur.

import { randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { z, ZodType } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { csrfCheck } from '@/utils/staff';
import {
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staffRoles';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withIdempotency,
  type IdempotencyScope,
} from '@/utils/adminIdempotency';
import { logger } from '@/utils/logger';
import {
  AdminError,
  type AdminErrorBody,
  type AdminErrorCode,
} from '@/utils/admin/errors';
import type { AdminDb } from '@/utils/admin/serviceContext';

/* -------------------------------------------------------------------------
 * Types publics
 * ---------------------------------------------------------------------- */

export const ROUTE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type RouteMethod = (typeof ROUTE_METHODS)[number];

/** Préréglages nommés : pas de nombres magiques recopiés route par route. */
export const RATE_LIMIT_PRESETS = {
  read: { max: 120, windowMs: 60_000 },
  write: { max: 60, windowMs: 60_000 },
  /** Gestes lourds : génération de ronde, envoi de campagne, import. */
  heavy: { max: 10, windowMs: 60_000 },
} as const;
export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;
export type RateLimitSpec =
  | RateLimitPreset
  | { max: number; windowMs: number }
  | false;

export const DEFAULT_CACHE_CONTROL = 'private, no-store';

/**
 * Valeur de retour qui signale que le handler a écrit la réponse lui-même
 * (export CSV, redirection, flux). Échappatoire, pas la norme. Une garde peut
 * aussi la rendre : elle a déjà répondu (contrat d'erreur historique).
 */
export const RESPONSE_SENT: unique symbol = Symbol('adminRouteResponseSent');

/** Ce que le noyau lit d'une méthode déclarée, quelle que soit la garde. */
export type CoreMethodSpec = {
  query?: ZodType;
  body?: ZodType;
  rateLimit?: RateLimitSpec;
  /**
   * `Cache-Control` de la réponse. Défaut `private, no-store` ; `false` pour
   * ne rien poser (le handler s'en charge).
   */
  cache?: string | false;
  /** Code HTTP de succès (200 par défaut ; 204 répond sans corps). */
  status?: number;
  // Les gardes typent finement les arguments ; le noyau ne fait que relayer.
  // `never` : toute signature de handler y est assignable (contravariance).
  handler: (args: never) => unknown;
};

/** Ce que le noyau fournit à la garde pour bâtir le contexte du handler. */
export type CoreContextBase<A> = {
  db: AdminDb;
  requestId: string;
  /** Accumule le détail de journal ; lu par `afterResponse`. */
  audit: (details: A) => void;
};

/**
 * Une garde : QUI appelle, quel contexte reçoit le handler, quoi journaliser.
 * `P` = l'identité résolue (principal), `S` = la forme d'une méthode déclarée,
 * `A` = le détail de journal accumulé par le handler.
 */
export type RouteGuardLayer<P, S extends CoreMethodSpec, A extends object> = {
  /** Préfixe des magasins de rate-limit, d'idempotence et des logs. */
  namespace: string;
  /** Vérifier l'origine sur les mutations (auth par cookie). */
  csrf: boolean;
  /**
   * Résout l'identité. Lève une erreur typée (`AdminError`, erreurs staff) ou
   * rend `RESPONSE_SENT` si elle a déjà répondu elle-même.
   */
  authorize: (
    req: NextApiRequest,
    res: NextApiResponse,
    method: RouteMethod,
    spec: S
  ) => Promise<P | typeof RESPONSE_SENT>;
  idempotent: (method: RouteMethod, spec: S) => boolean;
  idempotencyScope: (principal: P) => IdempotencyScope;
  context: (principal: P, base: CoreContextBase<A>) => unknown;
  /** Journal, APRÈS la réponse réussie. Best effort (erreurs journalisées). */
  afterResponse?: (
    principal: P,
    args: {
      method: RouteMethod;
      spec: S;
      audit: A | null;
      requestId: string;
      req: NextApiRequest;
    }
  ) => Promise<void>;
};

/* -------------------------------------------------------------------------
 * Implémentation
 * ---------------------------------------------------------------------- */

function sendError(
  res: NextApiResponse,
  status: number,
  body: AdminErrorBody
): void {
  res.status(status).json(body);
}

function errorBody(
  code: AdminErrorCode,
  error: string,
  requestId: string
): AdminErrorBody {
  return { error, code, requestId };
}

/** `a.b` → message ; le premier message par champ gagne. */
function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

function readRequestId(req: NextApiRequest): string {
  const raw = req.headers?.['x-request-id'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  // On accepte un identifiant fourni par le proxy s'il est raisonnable.
  if (typeof v === 'string' && /^[\w-]{8,100}$/.test(v)) return v;
  return randomUUID();
}

function resolveRateLimit(
  method: RouteMethod,
  spec: RateLimitSpec | undefined
): { max: number; windowMs: number } | null {
  if (spec === false) return null;
  if (spec === undefined) {
    return RATE_LIMIT_PRESETS[method === 'GET' ? 'read' : 'write'];
  }
  return typeof spec === 'string' ? RATE_LIMIT_PRESETS[spec] : spec;
}

/**
 * Erreur de validation zod, traduite en `code: 'validation'` + `fields`.
 * Le message est celui de la première issue : les schémas du projet posent
 * des messages métier en français (`{ error: '…' }`), cf. utils/validation.
 */
class ValidationErrorFromZod extends Error {
  readonly fields: Record<string, string>;
  constructor(error: z.ZodError) {
    super(error.issues[0]?.message ?? 'Requête invalide.');
    this.fields = zodFields(error);
  }
}

/** Assemble une route Next depuis ses méthodes déclarées et une garde. */
export function createRoute<P, S extends CoreMethodSpec, A extends object>(
  key: string,
  methods: Partial<Record<RouteMethod, S>>,
  layer: RouteGuardLayer<P, S, A>
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  const allow = ROUTE_METHODS.filter((m) => methods[m]).join(',');
  const tag = `${layer.namespace}:${key}`;

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const requestId = readRequestId(req);
    res.setHeader('X-Request-Id', requestId);
    const method = (req.method ?? 'GET').toUpperCase() as RouteMethod;
    const spec = (ROUTE_METHODS as readonly string[]).includes(method)
      ? methods[method]
      : undefined;

    if (!spec) {
      res.setHeader('Allow', allow);
      return sendError(
        res,
        405,
        errorBody('method_not_allowed', 'Method not allowed', requestId)
      );
    }

    if (spec.cache !== false) {
      res.setHeader('Cache-Control', spec.cache ?? DEFAULT_CACHE_CONTROL);
    }

    try {
      if (layer.csrf && !csrfCheck(req)) {
        return sendError(
          res,
          403,
          errorBody('forbidden', 'Forbidden: origin mismatch', requestId)
        );
      }

      const principal = await layer.authorize(req, res, method, spec);
      if (principal === RESPONSE_SENT) return;

      const limit = resolveRateLimit(method, spec.rateLimit);
      if (limit) {
        const bucket = method === 'GET' ? 'read' : 'write';
        // `applyRateLimit` écrit lui-même le 429 (forme historique).
        if (applyRateLimit(req, res, limit, `${tag}:${bucket}`)) {
          return;
        }
      }

      if (!supabaseAdmin) {
        return sendError(
          res,
          503,
          errorBody(
            'service_unavailable',
            'Database service unavailable (missing service role).',
            requestId
          )
        );
      }

      const run = async (rq: NextApiRequest, rs: NextApiResponse, p: P) => {
        const q = spec.query
          ? spec.query.safeParse(rq.query ?? {})
          : { success: true as const, data: {} };
        if (!q.success) {
          throw new ValidationErrorFromZod(q.error);
        }
        const b = spec.body
          ? spec.body.safeParse(rq.body ?? {})
          : { success: true as const, data: undefined };
        if (!b.success) {
          throw new ValidationErrorFromZod(b.error);
        }

        let auditDetails: A | null = null;
        const ctx = layer.context(p, {
          // `supabaseAdmin` reste non typé pour le code historique : seul le
          // chemin des modules migrés reçoit le client typé.
          db: supabaseAdmin as unknown as AdminDb,
          requestId,
          audit: (details) => {
            auditDetails = { ...(auditDetails ?? {}), ...details } as A;
          },
        });

        const result = await (spec.handler as (args: unknown) => unknown)({
          query: q.data,
          body: b.data,
          ctx,
          req: rq,
          res: rs,
        });

        if (result !== RESPONSE_SENT) {
          const status = spec.status ?? 200;
          // 204 = pas de corps : `.end()` et non `.json(null)`, qui en écrirait un.
          if (status === 204) rs.status(204).end();
          else rs.status(status).json(result ?? null);
        }

        // Journal APRÈS la réponse réussie : une mutation échouée n'est pas
        // tracée comme faite.
        if (layer.afterResponse) {
          await layer.afterResponse(p, {
            method,
            spec,
            audit: auditDetails,
            requestId,
            req: rq,
          });
        }
      };

      if (layer.idempotent(method, spec)) {
        await withIdempotency(run, {
          key: tag,
          scope: layer.idempotencyScope,
        })(req, res, principal);
      } else {
        await run(req, res, principal);
      }
    } catch (err: unknown) {
      if (err instanceof ValidationErrorFromZod) {
        return sendError(res, 400, {
          error: err.message,
          code: 'validation',
          fields: err.fields,
          requestId,
        });
      }
      if (err instanceof AdminError) {
        if (err.status >= 500) {
          logger.error(`[${tag}] ${err.code}`, { requestId, err });
        }
        return sendError(res, err.status, err.toBody(requestId));
      }
      if (err instanceof StaffUnauthenticatedError) {
        return sendError(
          res,
          401,
          errorBody('unauthenticated', err.message, requestId)
        );
      }
      if (err instanceof StaffUnauthorizedError) {
        return sendError(
          res,
          err.statusCode || 403,
          errorBody('forbidden', err.message, requestId)
        );
      }
      logger.error(`[${tag}] ${method} erreur inattendue`, {
        requestId,
        error: err,
      });
      return sendError(
        res,
        500,
        errorBody('internal', 'Erreur serveur', requestId)
      );
    }
  };
}
