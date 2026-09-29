// features/admin/tenants/routes/invitations.ts — /api/admin/tenants/[id]/invitations
//   GET  : invitations de l'espace (état calculé).
//   POST : inviter une adresse (rôle ≤ celui de l'invitant) ; le jeton ne
//          part que dans l'email.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery, InvitationCreateDoc } from '../schemas';
import { createInvitation, listInvitations } from '../service/members';
import { staffScope } from '../service/scope';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenant-invitations',
  guard: 'caster',
  GET: read({
    query: IdQuery,
    rateLimit: LIMIT,
    handler: ({ ctx, req }) =>
      listInvitations(ctx, staffScope(ctx.staff), req.query.id),
  }),
  POST: mutate({
    query: IdQuery,
    body: InvitationCreateDoc,
    rateLimit: LIMIT,
    status: 201,
    audit: 'invite_tenant_staff',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        createInvitation(ctx, staffScope(ctx.staff), req.query.id, req.body)
      ),
  }),
});
