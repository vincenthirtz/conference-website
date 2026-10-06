// features/admin/staff-planning/routes/byId.ts —
// /api/admin/staff-planning/[slotId] : PATCH (rôle, horaires, note),
// DELETE. 404 hors tenant actif. Tout le staff sur SES créneaux,
// `manage_staff` sur tous (cf. ./writer.ts, ../access.ts).

import { defineAdminRoute, mutate } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffPlanningSlotIdQuery, StaffPlanningSlotPatch } from '../schemas';
import { deleteSlot, updateSlot } from '../service';
import { resolvePlanningWriter } from './writer';

export default defineAdminRoute({
  key: 'staff-planning-item',
  guard: 'helper',
  PATCH: mutate({
    query: StaffPlanningSlotIdQuery,
    body: StaffPlanningSlotPatch,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'update_staff_planning_slot',
    handler: async ({ query, body, ctx, req, res }) =>
      audited(
        ctx,
        updateSlot(
          ctx,
          query.slotId,
          body,
          await resolvePlanningWriter(req, res, ctx.staff)
        )
      ),
  }),
  DELETE: mutate({
    query: StaffPlanningSlotIdQuery,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'delete_staff_planning_slot',
    handler: async ({ query, ctx, req, res }) =>
      audited(
        ctx,
        deleteSlot(
          ctx,
          query.slotId,
          await resolvePlanningWriter(req, res, ctx.staff)
        )
      ),
  }),
});
