// features/admin/staff-planning/routes/byId.ts —
// /api/admin/staff-planning/[slotId] : PATCH (rôle, horaires, note),
// DELETE. 404 hors tenant actif.

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffPlanningSlotIdQuery, StaffPlanningSlotPatch } from '../schemas';
import { deleteSlot, updateSlot } from '../service';

export default defineAdminRoute({
  key: 'staff-planning-item',
  guard: { permission: 'manage_staff' },
  PATCH: mutate({
    query: StaffPlanningSlotIdQuery,
    body: StaffPlanningSlotPatch,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'update_staff_planning_slot',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateSlot(ctx, query.slotId, body)),
  }),
  DELETE: mutate({
    query: StaffPlanningSlotIdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'delete_staff_planning_slot',
    handler: ({ query, ctx }) => audited(ctx, deleteSlot(ctx, query.slotId)),
  }),
});
