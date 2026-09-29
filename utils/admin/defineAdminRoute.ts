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
//
// Depuis le lot P3 (docs/PLAN-industrialisation-joueur.md), le pipeline vit
// dans le noyau `utils/http/defineRoute.ts`, partagé avec
// `defineSubjectRoute` ; ce fichier n'est plus que la GARDE STAFF (CSRF,
// `resolveGuard`, contexte staff, journal `staff_logs`) — sans changement
// de comportement.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { z, ZodType } from 'zod';
import { resolveGuard, type StaffGuard } from '@/utils/staff';
import { logStaffAction, type StaffLogAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import type { AuthenticatedStaffContext } from '@/types/staff';
import {
  createRoute,
  RESPONSE_SENT,
  ROUTE_METHODS,
  type RateLimitSpec,
} from '@/utils/http/defineRoute';
import type { ServiceContext } from './serviceContext';
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

export const ADMIN_METHODS = ROUTE_METHODS;
export type AdminMethod = (typeof ADMIN_METHODS)[number];
type MutatingMethod = Exclude<AdminMethod, 'GET'>;

// Préréglages, `Cache-Control` par défaut et `RESPONSE_SENT` vivent dans le
// noyau : réexportés ici pour les routes admin existantes.
export {
  RATE_LIMIT_PRESETS,
  DEFAULT_CACHE_CONTROL,
  RESPONSE_SENT,
  type RateLimitPreset,
} from '@/utils/http/defineRoute';

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

export function defineAdminRoute(def: AdminRouteDefinition): AdminRouteHandler {
  const declared = ADMIN_METHODS.filter((m) => def[m]);

  const meta: AdminRouteMeta = { key: def.key, methods: {} };
  const methods: Partial<Record<AdminMethod, AnyRead | AnyMutating>> = {};
  for (const m of declared) {
    const spec = def[m] as AnyRead | AnyMutating;
    const mutating = m !== 'GET';
    methods[m] = spec;
    meta.methods[m] = {
      guard: spec.guard ?? def.guard,
      audit: mutating ? (spec as AnyMutating).audit : null,
      idempotent: mutating && (spec as AnyMutating).idempotent !== false,
      query: spec.query,
      body: spec.body,
    };
  }

  const route = createRoute<
    AuthenticatedStaffContext,
    AnyRead | AnyMutating,
    AuditDetails
  >(def.key, methods, {
    namespace: 'admin',
    // Auth par cookie : l'origine est vérifiée sur les mutations.
    csrf: true,
    authorize: (req, res, method) =>
      resolveGuard(req, res, meta.methods[method]!.guard),
    idempotent: (method) => meta.methods[method]!.idempotent,
    idempotencyScope: (st) => ({ actorId: st.staff.id, tenantId: st.tenantId }),
    context: (st, base): AdminRouteContext => ({
      db: base.db,
      tenantId: st.tenantId,
      actor: { kind: 'staff', staffId: st.staff.id, userId: st.user.id },
      logger,
      staff: st,
      requestId: base.requestId,
      audit: base.audit,
    }),
    afterResponse: async (st, { method, audit, requestId }) => {
      // Best effort : un journal en panne ne transforme pas un succès en
      // erreur.
      const methodMeta = meta.methods[method]!;
      const d: AuditDetails = audit ?? {};
      const action = methodMeta.audit ? (d.action ?? methodMeta.audit) : null;
      if (!action || d.skip) return;
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
    },
  });

  return Object.assign(route, { adminRoute: meta });
}

export type { MutatingMethod };
