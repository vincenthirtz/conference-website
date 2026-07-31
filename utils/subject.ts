// utils/subject.ts
//
// SUBJECT RESOLUTION (S1) — "whose data is this request about?"
//
// Every player/team endpoint historically answered that question the same way:
// implicitly, with `user.id` (the caller). That forced the admin "mode vue
// player / vue capitaine" to be written as a SECOND implementation of the same
// reads (pages/api/admin/users/[userId]/{player,captain}-view.ts), which can
// only drift from the real player endpoints over time.
//
// This module makes the subject explicit and shared:
//
//   - no `?as=` → subject = the caller (strictly the previous behaviour)
//   - `?as=<uuid>` → subject = that user, IF the caller is staff (minRole
//     'admin' by default) — inspection, never impersonation.
//
// Rules enforced here, once, for every endpoint that opts in:
//
//   1. READ-ONLY. `?as=` is refused on anything but GET (403
//      `subject_read_only`). Opening writes to staff is a deliberate, separate
//      decision per endpoint — see S4. A consequence worth stating: in a mixed
//      GET/POST handler, `subject.userId === user.id` is GUARANTEED inside the
//      write branch, which is why those handlers can keep sharing a single
//      `userId` binding. S4 must re-read every such handler before relaxing
//      this rule, since sharing stops being safe at that moment.
//   2. TENANT SCOPING. When inspecting, the scope is the STAFF's ACTIVE tenant
//      (cookie `staff_active_tenant_id` → resolveActiveTenant), NOT the tenant
//      resolved for the target user. This preserves the guarantee of the
//      player-view/captain-view endpoints: an admin can never read a user's
//      data outside the tenant they are currently acting in.
//   3. EXISTENCE. An unknown target is a 404, not an empty snapshot.
//   4. AUDIT. Every inspection request is written to staff_logs
//      ('view_player_data' by default, 'view_captain_data' for the captain
//      area) with the endpoint path in the payload. One row PER REQUEST — no
//      dedupe: an audit trail that silently drops entries is worse than a
//      verbose one. `payload.endpoint` lets the logs UI group them.
//
// Deliberately NOT opted in (privacy / RGPD / device-scoped):
//   /api/player/discovery/*, /api/player/follows, /api/player/network-status,
//   /api/player/scouting, /api/player/teams-directory  → cross-tenant opt-in
//     network data, invisible by default; staff inspection is not a reason to
//     lift that.
//   /api/player/data-export, /api/player/delete-account, /api/player/push/*
//     → RGPD actions and per-device subscriptions, meaningless for a third party.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';

import { supabaseAdmin } from './supabase';
import {
  withAuthRoute,
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
  type StaffRole,
} from './staff';
import {
  resolveTenantIdForUserRequest,
  resolveTenantIdForUserRequestAsync,
} from './tenant';
import { logStaffAction } from './staffLogs';
import type { StaffLogAction } from '@/types/staffLogs';
import { SUBJECT_QUERY_PARAM } from './subjectParam';

import { logger } from './logger';

// Re-exported so server code has a single import site; the constant itself
// lives in `subjectParam` because the client imports it too.
export { SUBJECT_QUERY_PARAM, withSubjectParam } from './subjectParam';

/** uuid v1-v5 shape (Supabase auth issues v4, but stay lenient). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SubjectContext = {
  /** Whose data the handler must read. Use this instead of `user.id`. */
  userId: string;
  /** Tenant to scope every query with. Use this instead of resolveTenantIdForUserRequest(). */
  tenantId: string;
  /** The authenticated caller — always the real session user. */
  callerId: string;
  /** true when userId !== callerId (staff inspecting someone else). */
  isInspection: boolean;
  /** staff.id of the inspecting caller (null when not inspecting). */
  staffId: string | null;
  /** Staff role of the inspecting caller (null when not inspecting). */
  staffRole: StaffRole | null;
};

export type SubjectRouteOptions = {
  /** staff_logs action written on inspection. Default 'view_player_data'. */
  auditAction?: Extract<
    StaffLogAction,
    'view_player_data' | 'view_captain_data'
  >;
  /** Minimum staff role allowed to inspect. Default 'admin'. */
  minRole?: StaffRole;
  /**
   * Which tenant resolver to use for the SELF path — must match what the
   * endpoint used before migrating, otherwise its tenant scoping silently
   * changes. 'sync' = resolveTenantIdForUserRequest (no DB hit),
   * 'async' = resolveTenantIdForUserRequestAsync (reads team_members).
   * Default 'sync'. Irrelevant on the inspection path, where the tenant is
   * always the staff's active tenant.
   */
  tenantResolution?: 'sync' | 'async';
};

/** Error codes returned to the client, so the UI can branch without parsing prose. */
export type SubjectErrorCode =
  | 'invalid_subject'
  | 'subject_read_only'
  | 'subject_forbidden'
  | 'subject_not_found';

/**
 * Resolve the subject of the request.
 *
 * Returns `null` when it has ALREADY written an error response — callers must
 * bail out immediately (`if (!subject) return;`). Prefer `withSubjectRoute`,
 * which does that plumbing for you.
 */
export async function resolveSubject(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  options: SubjectRouteOptions = {}
): Promise<SubjectContext | null> {
  const self = async (): Promise<SubjectContext> => ({
    userId: user.id,
    tenantId:
      options.tenantResolution === 'async'
        ? await resolveTenantIdForUserRequestAsync(req, { authUserId: user.id })
        : resolveTenantIdForUserRequest(req, { authUserId: user.id }),
    callerId: user.id,
    isInspection: false,
    staffId: null,
    staffRole: null,
  });

  const raw = req.query?.[SUBJECT_QUERY_PARAM];
  const target = Array.isArray(raw) ? raw[0] : raw;

  // Fast path: the overwhelming majority of calls. Zero extra DB work.
  if (target === undefined || target === null || target === '') return self();

  if (typeof target !== 'string' || !UUID_RE.test(target)) {
    res
      .status(400)
      .json({ error: 'Invalid subject id.', code: 'invalid_subject' });
    return null;
  }

  // `?as=<myself>` is a no-op, not an inspection: no staff check, no audit row.
  if (target === user.id) return self();

  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.status(403).json({
      error: 'Subject inspection is read-only.',
      code: 'subject_read_only',
    });
    return null;
  }

  // Staff gate + active tenant, via the canonical resolver (cookie →
  // resolveActiveTenant → fallback) so inspection can never diverge from the
  // tenant the admin UI considers active.
  let staffCtx;
  try {
    staffCtx = await requireStaffRoleFromRequest(
      req,
      res,
      options.minRole ?? 'admin'
    );
  } catch (err) {
    if (
      err instanceof StaffUnauthenticatedError ||
      err instanceof StaffUnauthorizedError
    ) {
      res.status(403).json({ error: 'Forbidden.', code: 'subject_forbidden' });
      return null;
    }
    throw err;
  }

  // The target must exist — an unknown id is a 404, never an empty snapshot
  // (which would read as "this user has nothing" instead of "wrong id").
  const { data: authData, error: authErr } =
    await supabaseAdmin.auth.admin.getUserById(target);
  if (authErr || !authData?.user) {
    res
      .status(404)
      .json({ error: 'Subject not found.', code: 'subject_not_found' });
    return null;
  }

  // Audit — never block the response on a logging failure.
  try {
    await logStaffAction({
      staff_id: staffCtx.staff.id,
      action: options.auditAction ?? 'view_player_data',
      entity_type: 'user',
      entity_id: target,
      tenant_id: staffCtx.tenantId,
      payload: {
        endpoint: (req.url || '').split('?')[0] || null,
        email: (authData.user.email as string | null) ?? null,
      },
    });
  } catch (logErr) {
    logger.error('resolveSubject audit log failed:', logErr);
  }

  return {
    userId: target,
    tenantId: staffCtx.tenantId,
    callerId: user.id,
    isInspection: true,
    staffId: staffCtx.staff.id,
    staffRole: staffCtx.role,
  };
}

/**
 * `withAuthRoute` + subject resolution.
 *
 * Drop-in replacement for withAuthRoute on any endpoint whose reads should be
 * inspectable by staff:
 *
 *   export default withSubjectRoute(async function handler(req, res, { user, subject }) {
 *     const { userId, tenantId } = subject;   // instead of user.id + resolveTenantIdForUserRequest
 *     ...
 *   });
 *
 * `user` stays available and always designates the CALLER — keep using it for
 * write branches and for anything that must not be redirected to the subject.
 */
export function withSubjectRoute(
  handler: (
    req: NextApiRequest,
    res: NextApiResponse,
    ctx: { user: User; subject: SubjectContext }
  ) => Promise<unknown>,
  options: SubjectRouteOptions = {}
) {
  return withAuthRoute(async (req, res, { user }) => {
    const subject = await resolveSubject(req, res, user, options);
    if (!subject) return;

    // Inspected payloads describe someone else — never let them land in a
    // shared or browser cache. Several player endpoints legitimately set
    // `private, max-age=N` for their own caller, and they do it AFTER this
    // point, so a plain setHeader here would be overwritten. Pinning the
    // header for the rest of the request is the only way to make the guarantee
    // hold without auditing every handler's cache policy.
    if (subject.isInspection) {
      const setHeader = res.setHeader.bind(res);
      res.setHeader = ((name: string, value: unknown) =>
        String(name).toLowerCase() === 'cache-control'
          ? setHeader(name, 'private, no-store')
          : setHeader(name, value as never)) as typeof res.setHeader;
      res.setHeader('Cache-Control', 'private, no-store');
    }

    await handler(req, res, { user, subject });
  });
}
