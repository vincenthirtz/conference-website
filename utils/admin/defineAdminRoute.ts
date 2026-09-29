// utils/admin/defineAdminRoute.ts — la route admin déclarative (lot L3,
// docs/PLAN-industrialisation-admin.md).
//
// POURQUOI. Les 322 routes de `pages/api/admin` réécrivaient toutes le même
// squelette : aiguillage `req.method`, CSRF, garde staff, rate-limit,
// idempotence, parse du corps, `try/catch`, journal, `res.status().json()`.
// Chaque oubli était un bug : mutation sans idempotence, corps non validé,
// 405 sans `Allow`, erreur renvoyée en texte libre.
//
// Ici, une route DÉCLARE ce qu'elle accepte et RETOURNE ce qu'elle répond :
//
//   export default defineAdminRoute({
//     key: 'free-players',
//     guard: { permission: 'manage_teams' },
//     GET: { handler: ({ ctx }) => listFreePlayers(ctx) },
//     DELETE: {
//       query: z.object({ id: z.string().min(1) }),
//       audit: 'delete_free_player',
//       handler: ({ query, ctx }) => removeFreePlayer(ctx, query.id),
//     },
//   });
//
// Ordre d'exécution, identique pour toutes les routes :
//   méthode déclarée ? → CSRF → garde staff → rate-limit → idempotence
//   → validation (query, body) → handler → réponse → journal staff.
//
// Ce que le wrapper garantit sans que la route y pense :
//   * 405 + `Allow` sur une méthode non déclarée ;
//   * idempotence (`Idempotency-Key`) PAR DÉFAUT sur POST/PUT/PATCH/DELETE ;
//   * rate-limit par défaut (lecture 120/min, écriture 60/min par IP) ;
//   * `Cache-Control: private, no-store` par défaut — une donnée staff n'a
//     rien à faire dans un cache partagé ;
//   * une mutation déclare son slug de journal (`audit`) — ou `false`,
//     explicitement : le type refuse l'oubli ;
//   * toute erreur sort au format `AdminErrorBody` avec un `requestId`
//     qu'on retrouve dans les logs.

import { randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z, type ZodType } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { csrfCheck, resolveGuard, type StaffGuard } from '@/utils/staff';
import {
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staffRoles';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction, type StaffLogAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import type { AuthenticatedStaffContext } from '@/types/staff';
import { AdminError, type AdminErrorBody, type AdminErrorCode } from './errors';
import type { AdminDb, ServiceContext } from './serviceContext';
import { type AuditRecord, auditPayloadFromStates } from './auditDiff';

/** Payload écrit au journal : celui du handler + ce qui a changé. */
function auditPayload(d: AuditDetails): Record<string, unknown> | null {
  const states = auditPayloadFromStates(d.before, d.after);
  if (!d.payload && Object.keys(states).length === 0) return null;
  return { ...(d.payload ?? {}), ...states };
}

/* -------------------------------------------------------------------------
 * Types publics
 * ---------------------------------------------------------------------- */

export const ADMIN_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type AdminMethod = (typeof ADMIN_METHODS)[number];
type MutatingMethod = Exclude<AdminMethod, 'GET'>;

/** Préréglages nommés : pas de nombres magiques recopiés route par route. */
export const RATE_LIMIT_PRESETS = {
  read: { max: 120, windowMs: 60_000 },
  write: { max: 60, windowMs: 60_000 },
  /** Gestes lourds : génération de ronde, envoi de campagne, import. */
  heavy: { max: 10, windowMs: 60_000 },
} as const;
export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;

export const DEFAULT_CACHE_CONTROL = 'private, no-store';
type RateLimitSpec =
  | RateLimitPreset
  | { max: number; windowMs: number }
  | false;

/** Détail d'une entrée de journal, fourni par le handler via `ctx.audit`. */
export type AuditDetails = {
  entity_type?: string | null;
  entity_id?: string | null;
  tournament_id?: string | null;
  payload?: Record<string, unknown> | null;
  /**
   * États de l'entité AVANT et APRÈS le geste (lot L8). Le wrapper en tire
   * `payload.changes` (mise à jour), `payload.after` (création) ou
   * `payload.before` (suppression) — cf. utils/admin/auditDiff.ts.
   */
  before?: AuditRecord | null;
  after?: AuditRecord | null;
  /**
   * Issue du geste, quand une même méthode en a plusieurs (accord / refus
   * d'une candidature…) : remplace le slug déclaré pour CETTE entrée. Le slug
   * déclaré reste celui de la méthode (matrice, OpenAPI).
   */
  action?: AdminAuditAction;
  /**
   * Espace où ranger l'entrée, s'il n'est pas celui du staff : une route de
   * portée plateforme qui agit sur un espace tiers le journalise chez lui.
   */
  tenant_id?: string;
  /**
   * Rien à journaliser pour cet appel (rejeu idempotent d'un geste déjà
   * tracé, simple passage d'état sans décision).
   */
  skip?: boolean;
};

/**
 * Slug de journal d'une route déclarative. `other` est refusé : c'était le
 * fourre-tout qui faisait un quart du journal (A6) — une route qui naît
 * aujourd'hui déclare ce qu'elle fait.
 */
export type AdminAuditAction = Exclude<StaffLogAction, 'other'>;

/**
 * Contexte reçu par un handler. C'est un `ServiceContext` (on le passe tel
 * quel à un service) enrichi du contexte staff et de `audit`.
 */
export type AdminRouteContext = ServiceContext & {
  staff: AuthenticatedStaffContext;
  requestId: string;
  /**
   * Précise l'entrée de journal de la méthode (entité, payload). N'écrit
   * rien tout de suite : le journal n'est écrit QUE si le handler réussit.
   */
  audit: (details: AuditDetails) => void;
};

type HandlerArgs<Q, B> = {
  query: Q;
  body: B;
  ctx: AdminRouteContext;
  req: NextApiRequest;
  res: NextApiResponse;
};

/**
 * Valeur de retour qui signale que le handler a écrit la réponse lui-même
 * (export CSV, redirection, flux). Échappatoire, pas la norme.
 */
export const RESPONSE_SENT: unique symbol = Symbol('adminRouteResponseSent');

type MethodSpecBase<
  QS extends ZodType | undefined,
  BS extends ZodType | undefined,
  R,
> = {
  /** Remplace la garde de la route pour cette méthode. */
  guard?: StaffGuard;
  query?: QS;
  body?: BS;
  rateLimit?: RateLimitSpec;
  /**
   * `Cache-Control` de la réponse. Défaut `private, no-store` ; `false` pour
   * ne rien poser (le handler s'en charge).
   */
  cache?: string | false;
  /** Code HTTP de succès (200 par défaut ; 204 répond sans corps). */
  status?: number;
  handler: (
    args: HandlerArgs<
      QS extends ZodType ? z.output<QS> : Record<string, never>,
      BS extends ZodType ? z.output<BS> : undefined
    >
  ) => Promise<R | typeof RESPONSE_SENT> | R | typeof RESPONSE_SENT;
};

export type ReadMethodSpec<
  QS extends ZodType | undefined = undefined,
  R = unknown,
> = MethodSpecBase<QS, undefined, R>;

export type MutatingMethodSpec<
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  R = unknown,
> = MethodSpecBase<QS, BS, R> & {
  /**
   * Slug du journal staff. OBLIGATOIRE : `false` pour une mutation qui n'a
   * rien à tracer (prévisualisation, calcul) — l'oubli ne compile pas.
   */
  audit: AdminAuditAction | false;
  /** Idempotence `Idempotency-Key` (vrai par défaut). */
  idempotent?: boolean;
};

// Les génériques par méthode sont inférés à l'appel grâce à ces alias ouverts.
type AnyRead = ReadMethodSpec<any, any>;
type AnyMutating = MutatingMethodSpec<any, any, any>;

export type AdminRouteDefinition = {
  /** Identifiant stable : magasin de rate-limit, clé d'idempotence, logs. */
  key: string;
  /** Garde par défaut de toutes les méthodes. */
  guard: StaffGuard;
  GET?: AnyRead;
  POST?: AnyMutating;
  PUT?: AnyMutating;
  PATCH?: AnyMutating;
  DELETE?: AnyMutating;
};

/** Métadonnées exposées par la route (matrice de permissions, OpenAPI). */
export type AdminRouteMeta = {
  key: string;
  methods: Partial<
    Record<
      AdminMethod,
      {
        guard: StaffGuard;
        audit: AdminAuditAction | false | null;
        idempotent: boolean;
        query?: ZodType;
        body?: ZodType;
      }
    >
  >;
};

export type AdminRouteHandler = ((
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void>) & { adminRoute: AdminRouteMeta };

/* -------------------------------------------------------------------------
 * Aides à la déclaration (inférence des schémas méthode par méthode)
 * ---------------------------------------------------------------------- */

/** Déclare une méthode de lecture avec inférence de `query`. */
export function read<QS extends ZodType | undefined = undefined, R = unknown>(
  spec: ReadMethodSpec<QS, R>
): ReadMethodSpec<QS, R> {
  return spec;
}

/** Déclare une méthode mutante avec inférence de `query` et `body`. */
export function mutate<
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  R = unknown,
>(spec: MutatingMethodSpec<QS, BS, R>): MutatingMethodSpec<QS, BS, R> {
  return spec;
}

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
  method: AdminMethod,
  spec: RateLimitSpec | undefined
): { max: number; windowMs: number } | null {
  if (spec === false) return null;
  if (spec === undefined) {
    return RATE_LIMIT_PRESETS[method === 'GET' ? 'read' : 'write'];
  }
  return typeof spec === 'string' ? RATE_LIMIT_PRESETS[spec] : spec;
}

export function defineAdminRoute(def: AdminRouteDefinition): AdminRouteHandler {
  const declared = ADMIN_METHODS.filter((m) => def[m]);
  const allow = declared.join(',');

  const meta: AdminRouteMeta = { key: def.key, methods: {} };
  for (const m of declared) {
    const spec = def[m] as AnyRead | AnyMutating;
    const mutating = m !== 'GET';
    meta.methods[m] = {
      guard: spec.guard ?? def.guard,
      audit: mutating ? (spec as AnyMutating).audit : null,
      idempotent: mutating && (spec as AnyMutating).idempotent !== false,
      query: spec.query,
      body: spec.body,
    };
  }

  const route = async (req: NextApiRequest, res: NextApiResponse) => {
    const requestId = readRequestId(req);
    res.setHeader('X-Request-Id', requestId);
    const method = (req.method ?? 'GET').toUpperCase() as AdminMethod;
    const spec = (ADMIN_METHODS as readonly string[]).includes(method)
      ? (def[method] as AnyRead | AnyMutating | undefined)
      : undefined;

    if (!spec) {
      res.setHeader('Allow', allow);
      return sendError(
        res,
        405,
        errorBody('method_not_allowed', 'Method not allowed', requestId)
      );
    }

    const methodMeta = meta.methods[method]!;
    if (spec.cache !== false) {
      res.setHeader('Cache-Control', spec.cache ?? DEFAULT_CACHE_CONTROL);
    }

    try {
      if (!csrfCheck(req)) {
        return sendError(
          res,
          403,
          errorBody('forbidden', 'Forbidden: origin mismatch', requestId)
        );
      }

      const staff = await resolveGuard(req, res, methodMeta.guard);

      const limit = resolveRateLimit(method, spec.rateLimit);
      if (limit) {
        const bucket = method === 'GET' ? 'read' : 'write';
        // `applyRateLimit` écrit lui-même le 429 (forme historique).
        if (applyRateLimit(req, res, limit, `admin:${def.key}:${bucket}`)) {
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

      const run = async (
        rq: NextApiRequest,
        rs: NextApiResponse,
        st: AuthenticatedStaffContext
      ) => {
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

        let auditDetails: AuditDetails | null = null;
        const ctx: AdminRouteContext = {
          // `supabaseAdmin` reste non typé pour le code historique : seul le
          // chemin des modules migrés reçoit le client typé.
          db: supabaseAdmin as unknown as AdminDb,
          tenantId: st.tenantId,
          actor: { kind: 'staff', staffId: st.staff.id, userId: st.user.id },
          logger,
          staff: st,
          requestId,
          audit: (details) => {
            auditDetails = { ...(auditDetails ?? {}), ...details };
          },
        };

        const result = await spec.handler({
          query: q.data as never,
          body: b.data as never,
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
        // tracée comme faite. Best effort : un journal en panne ne transforme
        // pas un succès en erreur.
        const d: AuditDetails = auditDetails ?? {};
        const action = methodMeta.audit ? (d.action ?? methodMeta.audit) : null;
        if (action && !d.skip) {
          try {
            await logStaffAction({
              staff_id: st.staff.id,
              action,
              entity_type: d.entity_type ?? null,
              entity_id: d.entity_id ?? null,
              tournament_id: d.tournament_id ?? null,
              payload: auditPayload(d),
              tenant_id: d.tenant_id ?? st.tenantId,
              permission: st.permission ?? null,
            });
          } catch (logErr) {
            logger.error(`[admin:${def.key}] logStaffAction(${action})`, {
              requestId,
              error: logErr,
            });
          }
        }
      };

      if (methodMeta.idempotent) {
        await withAdminIdempotency(run, { key: `admin:${def.key}` })(
          req,
          res,
          staff
        );
      } else {
        await run(req, res, staff);
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
          logger.error(`[admin:${def.key}] ${err.code}`, { requestId, err });
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
      logger.error(`[admin:${def.key}] ${method} erreur inattendue`, {
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

  return Object.assign(route, { adminRoute: meta });
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

export type { MutatingMethod };
