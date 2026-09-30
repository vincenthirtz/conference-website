// features/admin/staff-planning/routes/byId.ts —
// /api/admin/staff-planning/[slotId] : DELETE. 404 hors tenant actif.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffPlanningSlotIdQuery } from '../schemas';
import { deleteSlot } from '../service';

export default defineAdminRoute({
  key: 'staff-planning-item',
  guard: { permission: 'manage_staff' },
  DELETE: mutate({
    query: StaffPlanningSlotIdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'delete_staff_planning_slot',
    handler: ({ query, ctx }) => audited(ctx, deleteSlot(ctx, query.slotId)),
  }),
});
