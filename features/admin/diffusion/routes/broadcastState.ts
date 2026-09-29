// features/admin/diffusion/routes/broadcastState.ts — /api/admin/broadcast/state
// Console de régie (Lot 7) : GET état agrégé du run live ; POST mise à jour
// partielle de `broadcast_state`. Toujours sur LE run live du tenant.
//
// Garde : rôle caster (lecture) ; l'écriture exige en plus le DROIT
// `manage_broadcast`, vérifié APRÈS la validation du corps (ordre et message
// d'origine : `403 Caster cannot edit state`).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { hasStaffPermission } from '@/utils/staffPermissions';
import { audited } from '../../_shared/audited';
import { BroadcastStatePatchDoc } from '../schemas';
import { getBroadcastState, patchBroadcastState } from '../service';

export default defineAdminRoute({
  key: 'broadcast-state',
  guard: 'caster',
  GET: read({
    handler: ({ ctx }) => getBroadcastState(ctx),
  }),
  POST: mutate({
    body: BroadcastStatePatchDoc,
    audit: 'broadcast_state_update',
    handler: ({ body, ctx }) =>
      audited(
        ctx,
        patchBroadcastState(
          ctx,
          body,
          hasStaffPermission(
            ctx.staff.role,
            ctx.staff.staff.extra_permissions,
            'manage_broadcast'
          )
        )
      ),
  }),
});
