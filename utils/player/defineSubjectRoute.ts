// utils/player/defineSubjectRoute.ts — la route déclarative côté SUJET
// (lot P3, docs/PLAN-industrialisation-joueur.md § 2).
//
// Même noyau que `defineAdminRoute` (utils/http/defineRoute.ts) : méthodes
// déclarées + 405/Allow, rate-limit par préréglages, idempotence par défaut
// sur les mutations, validation zod, erreurs typées + `requestId`. Seule la
// GARDE change :
//
//   export default defineSubjectRoute({
//     key: 'toggle-joinable',
//     tenantResolution: 'async',
//     POST: mutateSubject({
//       subject: 'follow', actAs: true,
//       team: { permission: 'manage_join_requests' },
//       body: ToggleJoinableBody,
//       handler: ({ body, ctx }) => toggleJoinable(ctx, body),
//     }),
//   });
//
// Ordre : méthode → Bearer → SUJET → ÉQUIPE → rate-limit → idempotence → zod
// → handler.
//
// SUJET (`subject`) — remplace le choix implicite withAuthRoute /
// withSubjectRoute (utils/subject.ts) par une déclaration :
//   * `'self'` (défaut) : le sujet est l'appelant. Un `?as=<autre>` est
//     REFUSÉ (403 `subject_unsupported`) au lieu d'être ignoré — ignoré, il
//     faisait lire au staff ses propres données en croyant inspecter.
//   * `'follow'` : sémantique exacte de `withSubjectRoute` — `?as=` suivi en
//     lecture (staff ≥ `minRole`, tenant ACTIF du staff, journal
//     `view_player_data`), écriture refusée (`subject_read_only`) SAUF si la
//     méthode déclare `actAs: true` ET que l'appelant le demande (`&act=1` /
//     `X-Staff-Act-As: 1`) : journal `act_as_player`. Réponse d'inspection
//     épinglée en `private, no-store`.
//
// ÉQUIPE (`team: { permission, param? }`) — un seul modèle de droit :
// `getManagedTeam` (capitainerie, rôle, surcharges par membre J3) sur l'équipe
// désignée par `?teamId=` (ou `param`), DANS le tenant du sujet, puis
// `assertTeamPermission`. Jamais `hasTeamPermission` (non scopé tenant).
//
// Pas de CSRF : auth Bearer uniquement (un navigateur ne l'attache pas seul).

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import type { z, ZodType } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { resolveUserFromToken, type StaffRole } from '@/utils/staff';
import {
  resolveSubject,
  SUBJECT_QUERY_PARAM,
  type SubjectContext,
  type SubjectRouteOptions,
} from '@/utils/subject';
import {
  assertTeamPermission,
  getManagedTeam,
  type TeamManagementAccess,
} from '@/utils/teams/managementAccess';
import { TEAM_SCOPE_QUERY_PARAM } from '@/utils/teamScopeParam';
import { isValidUUID } from '@/utils/apiHelpers';
import type { TeamPermission } from '@/utils/teamRoles';
import { logger, type Logger } from '@/utils/logger';
import {
  AdminError,
  LegacyAdminError,
  ServiceUnavailableError,
} from '@/utils/admin/errors';
import type { AdminDb } from '@/utils/admin/serviceContext';
import {
  createRoute,
  RESPONSE_SENT,
  ROUTE_METHODS,
  type RateLimitSpec,
  type RouteMethod,
} from '@/utils/http/defineRoute';

export { RESPONSE_SENT } from '@/utils/http/defineRoute';

/* -------------------------------------------------------------------------
 * Types publics
 * ---------------------------------------------------------------------- */

export type SubjectMode = 'self' | 'follow';

export type TeamRequirement = {
  /** Permission d'équipe exigée (cf. utils/teamRoles.ts). */
  permission: TeamPermission;
  /** Paramètre de query qui désigne l'équipe. Défaut `teamId`. */
  param?: string;
  /**
   * Code du refus 403, quand la route migrée en avait un historique
   * (`FORBIDDEN`…) : le contrat HTTP ne change pas à la migration. Défaut
   * `forbidden`.
   */
  forbiddenCode?: string;
};

/** Contexte reçu par un handler : de quoi appeler un service, sans HTTP. */
export type SubjectRouteContext = {
  db: AdminDb;
  /** Tenant du sujet : toute lecture/écriture y est scopée. */
  tenantId: string;
  /** Sujet de la requête (appelant, ou membre inspecté / représenté). */
  subject: SubjectContext;
  /** L'appelant authentifié — toujours la vraie session. */
  user: User;
  /** Accès à l'équipe exigée par `team`, `null` si la méthode n'en exige pas. */
  team: TeamManagementAccess | null;
  requestId: string;
  logger: Logger;
};

type HandlerArgs<Q, B, T> = {
  query: Q;
  body: B;
  ctx: Omit<SubjectRouteContext, 'team'> & { team: T };
  req: NextApiRequest;
  res: NextApiResponse;
};

/** Non distributif : `team?: TR` infère parfois `TR | undefined`. */
type TeamOf<TR> = [NonNullable<TR>] extends [never]
  ? null
  : TeamManagementAccess;

type SubjectMethodSpecBase<
  QS extends ZodType | undefined,
  BS extends ZodType | undefined,
  TR extends TeamRequirement | undefined,
  R,
> = {
  /** `'self'` (défaut) refuse `?as=` ; `'follow'` le suit (inspection). */
  subject?: SubjectMode;
  team?: TR;
  query?: QS;
  body?: BS;
  rateLimit?: RateLimitSpec;
  cache?: string | false;
  status?: number;
  handler: (
    args: HandlerArgs<
      QS extends ZodType ? z.output<QS> : Record<string, never>,
      BS extends ZodType ? z.output<BS> : undefined,
      TeamOf<TR>
    >
  ) => Promise<R | typeof RESPONSE_SENT> | R | typeof RESPONSE_SENT;
};

export type SubjectReadSpec<
  QS extends ZodType | undefined = undefined,
  TR extends TeamRequirement | undefined = undefined,
  R = unknown,
> = SubjectMethodSpecBase<QS, undefined, TR, R>;

export type SubjectMutatingSpec<
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  TR extends TeamRequirement | undefined = undefined,
  R = unknown,
> = SubjectMethodSpecBase<QS, BS, TR, R> & {
  /**
   * Autorise l'écriture « agir en tant que » (S4). Exige `subject: 'follow'`.
   * Décision par route : relire la branche d'écriture avant de la passer à
   * `true` (elle doit se scoper sur `ctx.subject`, jamais sur `ctx.user`).
   */
  actAs?: boolean;
  /** Idempotence `Idempotency-Key` (vrai par défaut). */
  idempotent?: boolean;
};

type AnyRead = SubjectReadSpec<any, any, any>;
type AnyMutating = SubjectMutatingSpec<any, any, any, any>;

export type SubjectRouteDefinition = {
  /** Identifiant stable : magasin de rate-limit, clé d'idempotence, logs. */
  key: string;
  /**
   * Résolution du tenant sur le chemin SELF — celle qu'utilisait la route
   * avant migration (cf. `SubjectRouteOptions.tenantResolution`). Défaut 'sync'.
   */
  tenantResolution?: 'sync' | 'async';
  /** Rôle staff minimal pour inspecter (`follow`). Défaut 'admin'. */
  minRole?: StaffRole;
  /** Slug du journal d'inspection (`follow`). Défaut 'view_player_data'. */
  inspectionAudit?: SubjectRouteOptions['auditAction'];
  GET?: AnyRead;
  POST?: AnyMutating;
  PUT?: AnyMutating;
  PATCH?: AnyMutating;
  DELETE?: AnyMutating;
};

/** Métadonnées exposées (matrice de permissions, contrat OpenAPI). */
export type SubjectRouteMeta = {
  key: string;
  methods: Partial<
    Record<
      RouteMethod,
      {
        subject: SubjectMode;
        team: TeamRequirement | null;
        actAs: boolean;
        idempotent: boolean;
        query?: ZodType;
        body?: ZodType;
      }
    >
  >;
};

export type SubjectRouteHandler = ((
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<void>) & { subjectRoute: SubjectRouteMeta };

/** Déclare une méthode de lecture avec inférence de `query` et `team`. */
export function readSubject<
  QS extends ZodType | undefined = undefined,
  TR extends TeamRequirement | undefined = undefined,
  R = unknown,
>(spec: SubjectReadSpec<QS, TR, R>): SubjectReadSpec<QS, TR, R> {
  return spec;
}

/** Déclare une méthode mutante avec inférence de `query`, `body` et `team`. */
export function mutateSubject<
  QS extends ZodType | undefined = undefined,
  BS extends ZodType | undefined = undefined,
  TR extends TeamRequirement | undefined = undefined,
  R = unknown,
>(
  spec: SubjectMutatingSpec<QS, BS, TR, R>
): SubjectMutatingSpec<QS, BS, TR, R> {
  return spec;
}

/* -------------------------------------------------------------------------
 * Implémentation
 * ---------------------------------------------------------------------- */

type Principal = {
  user: User;
  subject: SubjectContext;
  team: TeamManagementAccess | null;
};

function firstQueryValue(req: NextApiRequest, name: string): unknown {
  const raw = req.query?.[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Même contrat que `readRequestedTeamId` : invalide = absent (repli sûr). */
function readTeamId(req: NextApiRequest, param: string): string | null {
  const value = firstQueryValue(req, param);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && isValidUUID(trimmed) ? trimmed : null;
}

/** Épingle `Cache-Control: private, no-store` (réponse d'inspection). */
function pinNoStore(res: NextApiResponse): void {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: unknown) =>
    String(name).toLowerCase() === 'cache-control'
      ? setHeader(name, 'private, no-store')
      : setHeader(name, value as never)) as typeof res.setHeader;
  res.setHeader('Cache-Control', 'private, no-store');
}

export function defineSubjectRoute(
  def: SubjectRouteDefinition
): SubjectRouteHandler {
  const meta: SubjectRouteMeta = { key: def.key, methods: {} };
  const methods: Partial<Record<RouteMethod, AnyRead | AnyMutating>> = {};

  for (const m of ROUTE_METHODS) {
    const spec = def[m] as AnyRead | AnyMutating | undefined;
    if (!spec) continue;
    const mutating = m !== 'GET';
    const subject: SubjectMode = spec.subject ?? 'self';
    const actAs = mutating && (spec as AnyMutating).actAs === true;
    // Échec au chargement du module, pas à la première requête.
    if (actAs && subject !== 'follow') {
      throw new Error(
        `[defineSubjectRoute:${def.key}] ${m} : actAs exige subject: 'follow'.`
      );
    }
    methods[m] = spec;
    meta.methods[m] = {
      subject,
      team: spec.team ?? null,
      actAs,
      idempotent: mutating && (spec as AnyMutating).idempotent !== false,
      query: spec.query,
      body: spec.body,
    };
  }

  const route = createRoute<Principal, AnyRead | AnyMutating, object>(
    def.key,
    methods,
    {
      namespace: 'player',
      // Bearer uniquement : pas d'attache automatique par le navigateur.
      csrf: false,
      authorize: async (req, res, method) => {
        const methodMeta = meta.methods[method]!;
        if (!supabaseAdmin) {
          throw new ServiceUnavailableError('Service unavailable.');
        }

        const authHeader = req.headers.authorization;
        const token =
          authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length)
            : undefined;
        if (!token) {
          throw new AdminError(401, 'unauthenticated', 'Token required.');
        }
        const user = await resolveUserFromToken(token);
        if (!user) {
          throw new AdminError(401, 'unauthenticated', 'Not authenticated.');
        }

        if (methodMeta.subject === 'self') {
          const target = firstQueryValue(req, SUBJECT_QUERY_PARAM);
          if (target !== undefined && target !== '' && target !== user.id) {
            throw new LegacyAdminError(
              403,
              'Subject inspection is not available on this endpoint.',
              { code: 'subject_unsupported' }
            );
          }
        }

        // Sans `?as=` (ou `?as=<moi>`), `resolveSubject` rend l'appelant sans
        // rien écrire ; en `follow`, il porte les règles S1/S4 et répond
        // lui-même (contrat `{ error, code }` historique) quand il refuse.
        const subject = await resolveSubject(req, res, user, {
          tenantResolution: def.tenantResolution,
          minRole: def.minRole,
          auditAction: def.inspectionAudit,
          allowActAs: methodMeta.actAs,
        });
        if (!subject) return RESPONSE_SENT;
        if (subject.isInspection) pinNoStore(res);

        let team: TeamManagementAccess | null = null;
        if (methodMeta.team) {
          const access = await getManagedTeam(
            subject.userId,
            subject.tenantId,
            readTeamId(req, methodMeta.team.param ?? TEAM_SCOPE_QUERY_PARAM)
          );
          const denied = assertTeamPermission(
            access,
            methodMeta.team.permission
          );
          if (denied) {
            const code = methodMeta.team.forbiddenCode;
            throw code
              ? new LegacyAdminError(403, denied.error, { code })
              : new AdminError(403, 'forbidden', denied.error);
          }
          team = access;
        }

        return { user, subject, team };
      },
      idempotent: (method) => meta.methods[method]!.idempotent,
      // L'acteur est l'appelant ; sous act-as, le sujet en fait partie.
      idempotencyScope: ({ user, subject }) => ({
        actorId: subject.isInspection
          ? `${user.id}>${subject.userId}`
          : user.id,
        tenantId: subject.tenantId,
      }),
      context: ({ user, subject, team }, base): SubjectRouteContext => ({
        db: base.db,
        tenantId: subject.tenantId,
        subject,
        user,
        team,
        requestId: base.requestId,
        logger,
      }),
    }
  );

  return Object.assign(route, { subjectRoute: meta });
}
