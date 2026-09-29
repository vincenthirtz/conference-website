// features/admin/scrims/routes/forward.ts — POST /api/admin/scrims/forward
// Transfère une demande de scrim EXTERNE (publique) vers une autre équipe :
// la demandeuse a visé la mauvaise équipe, ou la cible a décliné.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ScrimForwardBody } from '../schemas';
import { forwardScrimRequest } from '../service/scrims';

export default defineAdminRoute({
  key: 'admin-scrims-forward',
  guard: 'caster',
  POST: mutate({
    body: ScrimForwardBody,
    status: 201,
    audit: 'forward_scrim_request',
    handler: ({ body, ctx }) => audited(ctx, forwardScrimRequest(ctx, body)),
  }),
});
