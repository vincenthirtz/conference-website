// features/admin/scrims/routes/calendar.ts — GET /api/admin/scrims/calendar
// Agenda staff sur [from, to) : scrims éditables + matchs programmés (lecture
// seule, pour repérer les collisions). Fenêtre bornée à ~90 jours.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { ScrimCalendarQuery } from '../schemas';
import { getScrimCalendar } from '../service/scrims';

export default defineAdminRoute({
  key: 'admin-scrims-calendar',
  guard: { permission: 'manage_teams' },
  GET: read({
    query: ScrimCalendarQuery,
    handler: ({ query, ctx }) => getScrimCalendar(ctx, query),
  }),
});
