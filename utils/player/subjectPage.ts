// utils/player/subjectPage.ts — la garde SSR d'une page RÉSERVÉE de l'espace
// joueuse (lot P10), pendant de `defineSubjectRoute` pour `getServerSideProps`.
//
// La page ne touche plus la base : elle déclare un `load` qui reçoit
// `{ db, tenantId, subject, logger }` et appelle le service de son module.
//
// Sujet :
//   * sans `?as=` (ou `?as=<moi>`) : l'appelante, tenant de la requête ;
//   * `?as=<id>&act=1` : ENTRÉE act-as staff (S4), mêmes clés que les routes
//     `allowActAs` — option `actAs` de la page ET `act=1` de l'appelant, staff
//     ≥ admin, tenant ACTIF du staff, sujet existant. L'entrée est journalisée
//     (`view_captain_data`, `act: true`) ; chaque écriture l'est ensuite par
//     sa route (`act_as_player`). Consultation et écriture restent
//     distinguables dans le journal.
//   * `?as=` sans `act=1` : refusé (une page d'édition n'a pas de mode
//     lecture seule) → `/403`, comme un staff non habilité.
//
// Sans session : redirection vers `/login?next=…`.

import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next';
import { supabaseAdmin, getServerClient } from '@/utils/supabase';
import {
  requireStaffRoleFromRequest,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger, type Logger } from '@/utils/logger';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { SubjectContext } from '@/utils/subject';
import { ACT_AS_QUERY_PARAM, SUBJECT_QUERY_PARAM } from '@/utils/subjectParam';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Portée transmise à la page : les appels du client la reportent. */
export type SubjectPageScope = { subjectId: string | null; actAs: boolean };

export type SubjectPageContext = {
  db: AdminDb;
  tenantId: string;
  subject: SubjectContext;
  logger: Logger;
};

export type SubjectPageOptions<P> = {
  /** Motif de la page, écrit au journal (`/team/[slug]/edit`). */
  endpoint: string;
  /** Accepte l'entrée `?as=…&act=1`. */
  actAs?: boolean;
  /** Destination `next=` de la connexion. */
  loginNext: (ctx: GetServerSidePropsContext) => string;
  load: (
    ctx: GetServerSidePropsContext,
    sctx: SubjectPageContext
  ) => Promise<GetServerSidePropsResult<P>>;
};

const FORBIDDEN = { redirect: { destination: '/403', permanent: false } };

function first(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : undefined;
}

/** Entrée act-as : `null` = refus (réponse `/403`). */
async function resolveActAsSubject(
  ctx: GetServerSidePropsContext,
  callerId: string,
  target: string,
  endpoint: string
): Promise<SubjectContext | null> {
  const act = first(ctx.query?.[ACT_AS_QUERY_PARAM]);
  if (!UUID_RE.test(target) || (act !== '1' && act !== 'true')) return null;

  let staffCtx: AuthenticatedStaffContext;
  try {
    staffCtx = await requireStaffRoleFromRequest(ctx.req, ctx.res, 'admin');
  } catch {
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(target);
  if (error || !data?.user) return null;

  try {
    await logStaffAction({
      staff_id: staffCtx.staff.id,
      action: 'view_captain_data',
      entity_type: 'user',
      entity_id: target,
      tenant_id: staffCtx.tenantId,
      payload: {
        endpoint,
        email: (data.user.email as string | null) ?? null,
        act: true,
      },
    });
  } catch (logErr) {
    logger.error('[subjectPage] audit log failed:', logErr);
  }

  return {
    userId: target,
    tenantId: staffCtx.tenantId,
    callerId,
    isInspection: true,
    staffId: staffCtx.staff.id,
    staffRole: staffCtx.role,
    isActingAs: true,
  };
}

export function defineSubjectPage<P extends Record<string, unknown>>(
  options: SubjectPageOptions<P>
): GetServerSideProps<P & { subjectScope: SubjectPageScope }> {
  return async (ctx) => {
    const supabase = getServerClient(ctx.req, ctx.res);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        redirect: {
          destination: `/login?next=${options.loginNext(ctx)}`,
          permanent: false,
        },
      };
    }

    const target = first(ctx.query?.[SUBJECT_QUERY_PARAM]);
    let subject: SubjectContext;
    if (target && target !== user.id) {
      if (!options.actAs) return FORBIDDEN;
      const resolved = await resolveActAsSubject(
        ctx,
        user.id,
        target,
        options.endpoint
      );
      if (!resolved) return FORBIDDEN;
      subject = resolved;
    } else {
      subject = {
        userId: user.id,
        tenantId: resolveTenantIdForUserRequest(ctx.req, {
          authUserId: user.id,
        }),
        callerId: user.id,
        isInspection: false,
        staffId: null,
        staffRole: null,
        isActingAs: false,
      };
    }

    const result = await options.load(ctx, {
      db: supabaseAdmin as unknown as AdminDb,
      tenantId: subject.tenantId,
      subject,
      logger,
    });
    if (!('props' in result)) return result;
    const props = await result.props;
    return {
      props: {
        ...props,
        subjectScope: {
          subjectId: subject.isInspection ? subject.userId : null,
          actAs: subject.isActingAs,
        },
      },
    };
  };
}
