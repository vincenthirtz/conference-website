// features/admin/staff-planning/routes/index.ts — /api/admin/staff-planning :
// GET créneaux d'une fenêtre (`?from=&to=`), POST un créneau saisi à la main.
// Lecture ouverte à tout le staff (chacun consulte le planning). Écriture :
// tout le staff pour SES disponibilités (« Mes dispos », contrôlé par le
// service), `manage_staff` pour celles de tout le monde (cf. ./writer.ts).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { selfNameOf } from '../access';
import { StaffPlanningListQuery, StaffPlanningSlotCreate } from '../schemas';
import { createSlot, listPlanning } from '../service';
import { resolvePlanningWriter } from './writer';

export default defineAdminRoute({
  key: 'staff-planning',
  guard: 'helper',
  GET: read({
    query: StaffPlanningListQuery,
    handler: ({ query, ctx }) =>
      listPlanning(ctx, query, selfNameOf(ctx.staff.staff.display_name)),
  }),
  POST: mutate({
    body: StaffPlanningSlotCreate,
    status: 201,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'create_staff_planning_slot',
    handler: async ({ body, ctx, req, res }) =>
      audited(
        ctx,
        createSlot(ctx, body, await resolvePlanningWriter(req, res, ctx.staff))
      ),
  }),
});
