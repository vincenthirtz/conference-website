// features/admin/adherents/routes/index.ts — /api/admin/adherents
//   GET  : liste paginée côté serveur (contrat de liste, lot L13) + compteurs
//   POST : création manuelle (la synchro HelloAsso a sa propre route)

import {
  defineAdminRoute,
  mutate,
  read,
} from '../../../../utils/admin/defineAdminRoute';
import { AdherentCreateBody, AdherentListQuery } from '../schemas';
import { createAdherent, listAdherentsWithStats } from '../service';

export default defineAdminRoute({
  key: 'adherents',
  // Donnée d'association, pas de tenant : garde sur le rôle global.
  guard: { permission: 'manage_communications', scope: 'platform' },
  GET: read({
    query: AdherentListQuery,
    handler: ({ query, ctx }) => listAdherentsWithStats(ctx, query),
  }),
  POST: mutate({
    body: AdherentCreateBody,
    status: 201,
    audit: 'create_adherent',
    handler: async ({ body, ctx }) => {
      const row = await createAdherent(ctx, body, ctx.staff.staff.id ?? null);
      // Photo SANS coordonnées : le journal est lu par plus de monde que la
      // fiche. Nom et email suffisent à retrouver qui a été créé.
      ctx.audit({
        entity_type: 'adherent',
        entity_id: row.id,
        after: {
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
        },
      });
      return row;
    },
  }),
});
