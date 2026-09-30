// features/admin/tenants/service/members.ts — staff rattaché à un espace et
// invitations.
//
// Le jeton d'invitation n'est JAMAIS stocké en clair (empreinte seule) ni
// rendu dans une réponse : il ne circule que dans l'email.

import crypto from 'node:crypto';
import * as z from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { StaffRole } from '@/types/admin';
import { isValidUUID } from '@/utils/apiHelpers';
import { hasAtLeastRole, STAFF_ROLES } from '@/utils/staffRoles';
import { sendEmail } from '@/utils/email';
import { buildInvitationEmail } from '@/utils/tenants/invitationEmail';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/tenants';
import {
  type StaffScope,
  assertTenantInScope,
  requireUuid,
  serverError,
} from './scope';
import { withIdentities } from './tenants';

// Nomenclature stricte : le garde « dernier admin » compte `role === 'admin'`.
const staffRoleSchema = z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]);

/* ------------------------------- staff --------------------------------- */

/** GET /api/admin/tenants/[id]/staff */
export async function listTenantStaff(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = requireUuid(rawId, 'Invalid tenant id.');
  await assertTenantInScope(scope, id);
  const { rows, error } = await repo.listTenantStaff(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenants/[id]/staff] list error', error);
    throw serverError('Failed to load staff.');
  }
  return { staff: await withIdentities(ctx, rows) };
}

/**
 * POST /api/admin/tenants/[id]/staff — owner (effectif) ; rattache un staff
 * EXISTANT (par `staff_id` ou `email`), rôle `admin` par défaut.
 */
export async function addTenantStaff(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const id = requireUuid(rawId, 'Invalid tenant id.');
  if (!hasAtLeastRole(scope.role, 'owner')) {
    throw new LegacyAdminError(403, 'Forbidden.');
  }
  await assertTenantInScope(scope, id);
  const b = (body ?? {}) as Record<string, unknown>;
  const staffIdInput = typeof b.staff_id === 'string' ? b.staff_id.trim() : '';
  const emailInput =
    typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const roleParsed = staffRoleSchema.safeParse(
    typeof b.role === 'string' && b.role.trim() ? b.role.trim() : 'admin'
  );
  if (!roleParsed.success) {
    throw new LegacyAdminError(
      400,
      `Invalid role. Allowed values: ${STAFF_ROLES.join(', ')}.`,
      { code: 'INVALID_ROLE' }
    );
  }
  const role = roleParsed.data;
  if (!staffIdInput && !emailInput) {
    throw new LegacyAdminError(400, 'staff_id or email is required.', {
      code: 'MISSING_IDENTIFIER',
    });
  }
  if (staffIdInput && !isValidUUID(staffIdInput)) {
    throw new LegacyAdminError(400, 'staff_id must be a UUID.', {
      code: 'INVALID_STAFF_ID',
    });
  }
  const { row: found, error: gErr } = staffIdInput
    ? await repo.findStaffById(ctx.db, staffIdInput)
    : await repo.findStaffByEmail(ctx.db, emailInput);
  if (gErr || !found) {
    throw new LegacyAdminError(404, 'Staff not found.', {
      code: 'STAFF_NOT_FOUND',
      extra: emailInput ? { email: emailInput } : undefined,
    });
  }
  const staffId = found.id;
  const { error } = await repo.upsertTenantStaff(ctx.db, {
    tenant_id: id,
    staff_id: staffId,
    role,
  });
  if (error) {
    ctx.logger.error('[admin/tenants/[id]/staff] upsert error', error);
    throw serverError('Failed to add staff.');
  }
  return {
    result: { staff: { staff_id: staffId, role, tenant_id: id } },
    audit: { entity_type: 'tenant', entity_id: id, payload: { staffId, role } },
  } satisfies Audited<unknown>;
}

/** DELETE /api/admin/tenants/[id]/staff/[staffId] — jamais le dernier admin. */
export async function removeTenantStaff(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  rawStaffId: unknown
) {
  if (!hasAtLeastRole(scope.role, 'owner')) {
    throw new LegacyAdminError(403, 'Forbidden.');
  }
  const id = requireUuid(rawId, 'Invalid tenant id.');
  const staffId = requireUuid(rawStaffId, 'Invalid staff id.');
  await assertTenantInScope(scope, id);
  const { rows: all, error } = await repo.listTenantStaffRoles(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenants/[id]/staff/[staffId]] list error', error);
    throw serverError('Failed to load staff.');
  }
  const target = all.find((r) => r.staff_id === staffId);
  if (!target) throw new LegacyAdminError(404, 'Staff not in tenant.');
  const adminCount = all.filter((r) => r.role === 'admin').length;
  if (target.role === 'admin' && adminCount <= 1) {
    throw new LegacyAdminError(
      409,
      'Cannot remove the last admin of this tenant.',
      { code: 'LAST_ADMIN' }
    );
  }
  const { error: delErr } = await repo.deleteTenantStaff(ctx.db, id, staffId);
  if (delErr) {
    ctx.logger.error(
      '[admin/tenants/[id]/staff/[staffId]] delete error',
      delErr
    );
    throw serverError('Failed to remove staff.');
  }
  return {
    result: { deleted: true as const, staff_id: staffId, tenant_id: id },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      payload: { staffId, role: target.role },
    },
  } satisfies Audited<unknown>;
}

/* ----------------------------- invitations ----------------------------- */

/** Deux semaines. */
const TTL_DAYS = 14;
const invitationSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]),
});
const sha256 = (v: string) =>
  crypto.createHash('sha256').update(v).digest('hex');

async function invitationTenant(scope: StaffScope, rawId: unknown) {
  const id = requireUuid(rawId, 'Invalid tenant id.', 'INVALID_TENANT_ID');
  await assertTenantInScope(scope, id);
  return id;
}

/** GET /api/admin/tenants/[id]/invitations — état CALCULÉ. */
export async function listInvitations(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = await invitationTenant(scope, rawId);
  const { rows, error } = await repo.listInvitations(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenant-invitations] list error', error);
    throw serverError('Failed to load invitations.');
  }
  const now = Date.now();
  return {
    invitations: rows.map((r) => ({
      ...r,
      status: r.accepted_at
        ? 'accepted'
        : r.revoked_at
          ? 'revoked'
          : Date.parse(r.expires_at) <= now
            ? 'expired'
            : 'pending',
    })),
  };
}

/**
 * POST /api/admin/tenants/[id]/invitations — une seule invitation vivante par
 * adresse ; le rôle ne dépasse pas celui de l'invitant ; l'email part avec le
 * compte d'envoi DE L'ESPACE.
 */
export async function createInvitation(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const id = await invitationTenant(scope, rawId);
  const parsed = invitationSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body', {
      code: 'INVALID_BODY',
      extra: { details: parsed.error.flatten() },
    });
  }
  const email = parsed.data.email.toLowerCase();
  const role = parsed.data.role;
  if (!hasAtLeastRole(scope.role, role)) {
    throw new LegacyAdminError(
      403,
      'Le rôle invité ne peut pas dépasser le vôtre.',
      { code: 'ROLE_ABOVE_INVITER' }
    );
  }
  const { row: tenant } = await repo.getTenantIdentity(ctx.db, id);
  if (!tenant) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  const { row: existingStaff } = await repo.findStaffByEmail(ctx.db, email);
  if (existingStaff?.id) {
    if (await repo.getTenantStaffLink(ctx.db, id, existingStaff.id)) {
      throw new LegacyAdminError(
        409,
        'Cette personne fait déjà partie de cet espace.',
        { code: 'ALREADY_MEMBER' }
      );
    }
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  await repo.revokeLiveInvitationsFor(ctx.db, id, email);
  const { row: created, error } = await repo.insertInvitation(ctx.db, {
    tenant_id: id,
    email,
    role,
    token_hash: sha256(token),
    invited_by: scope.staffId,
    expires_at: expiresAt,
  });
  if (error) {
    ctx.logger.error('[admin/tenant-invitations] insert error', error);
    throw serverError('Failed to create invitation.');
  }
  const mail = buildInvitationEmail({
    tenantName: tenant.name,
    role,
    token,
    expiresAt,
  });
  const sent = await sendEmail({
    tenantId: id,
    to: email,
    subject: mail.subject,
    html: mail.html,
  });
  return {
    result: {
      invitation: { ...(created as object), status: 'pending' as const },
      emailSent: sent.success === true,
      emailError: sent.success === true ? null : (sent.error ?? 'unknown'),
    },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'invite_tenant_staff',
        email,
        role,
        emailSent: sent.success === true,
      },
    },
  } satisfies Audited<unknown>;
}

/** DELETE /api/admin/tenants/[id]/invitations/[invitationId] — idempotent. */
export async function revokeInvitation(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  rawInvitationId: unknown
) {
  if (
    typeof rawId !== 'string' ||
    !isValidUUID(rawId) ||
    typeof rawInvitationId !== 'string' ||
    !isValidUUID(rawInvitationId)
  ) {
    throw new LegacyAdminError(400, 'Invalid ids.', { code: 'INVALID_IDS' });
  }
  const id = rawId;
  await assertTenantInScope(scope, id);
  // Filtre AUSSI sur l'espace : sinon un id suffirait chez le voisin.
  const { row, error } = await repo.revokeInvitation(
    ctx.db,
    id,
    rawInvitationId
  );
  if (error) {
    ctx.logger.error('[admin/tenant-invitations] revoke error', error);
    throw serverError('Failed to revoke invitation.');
  }
  return {
    result: { revoked: Boolean(row) },
    // Rien révoqué (déjà acceptée, révoquée, inconnue) : 200, rien au journal.
    audit: row
      ? {
          entity_type: 'tenant',
          entity_id: id,
          tenant_id: id,
          payload: { action: 'revoke_tenant_invitation', email: row.email },
        }
      : { skip: true },
  } satisfies Audited<unknown>;
}
