// features/admin/staff-planning/routes/index.ts — /api/admin/staff-planning :
// GET créneaux d'une fenêtre (`?from=&to=`), POST un créneau saisi à la main.
// Lecture ouverte à tout le staff (chacun consulte le planning) ; écriture
// réservée à la gestion du staff.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { StaffPlanningListQuery, StaffPlanningSlotCreate } from '../schemas';
import { createSlot, listPlanning } from '../service';

export default defineAdminRoute({
  key: 'staff-planning',
  guard: { permission: 'manage_staff' },
  GET: read({
    guard: 'helper',
    query: StaffPlanningListQuery,
    handler: ({ query, ctx }) => listPlanning(ctx, query),
  }),
  POST: mutate({
    body: StaffPlanningSlotCreate,
    status: 201,
    rateLimit: { max: 60, windowMs: 60_000 },
    audit: 'create_staff_planning_slot',
    handler: ({ body, ctx }) => audited(ctx, createSlot(ctx, body)),
  }),
});
