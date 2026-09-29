// features/admin/tenants/routes/invitationById.ts
// DELETE /api/admin/tenants/[id]/invitations/[invitationId] — révocation
// idempotente (200 `{ revoked: false }` s'il n'y avait rien à révoquer).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { TenantInvitationIdQuery } from '../schemas';
import { revokeInvitation } from '../service/members';
import { staffScope } from '../service/scope';

export default defineAdminRoute({
  key: 'admin-tenant-invite-revoke',
  guard: 'caster',
  DELETE: mutate({
    query: TenantInvitationIdQuery,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'revoke_tenant_invitation',
    handler: ({ ctx, req }) =>
      audited(
        ctx,
        revokeInvitation(
          ctx,
          staffScope(ctx.staff),
          req.query.id,
          req.query.invitationId
        )
      ),
  }),
});
