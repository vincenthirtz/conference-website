// features/admin/scrims/routes/planningAvailability.ts
// /api/admin/scrim-plannings/[planningId]/availability — le staff déclare SES
// créneaux (party='staff') depuis la fiche de la grille. Tout le staff : se
// déclarer dispo n'est pas gérer les équipes. PUT refusé si la grille n'est
// pas 'open' (409 PLANNING_NOT_OPEN).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { PlanningAvailabilityBody, PlanningIdQuery } from '../schemas';
import { getMyAvailability, saveMyAvailability } from '../service/plannings';

export default defineAdminRoute({
  key: 'admin-scrim-planning-availability',
  guard: 'caster',
  GET: read({
    query: PlanningIdQuery,
    handler: ({ query, ctx }) => getMyAvailability(ctx, query.planningId),
  }),
  PUT: mutate({
    query: PlanningIdQuery,
    body: PlanningAvailabilityBody,
    // Ses propres dispos : rien à tracer au journal staff (comme avant).
    audit: false,
    handler: ({ query, body, ctx }) =>
      saveMyAvailability(
        ctx,
        query.planningId,
        body,
        ctx.staff.staff.display_name ?? null
      ),
  }),
});
