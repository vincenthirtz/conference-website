// features/admin/site-settings/routes/seasonalLogos.ts
// /api/admin/site-settings/seasonal-logos — le calendrier des logos
// d'événement (Octobre rose, Halloween, Noël…).
//
//   GET → { logos, activeId, today }
//   PUT { logos } → remplace la liste ENTIÈRE, validée

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { SEASONAL_LOGOS_SETTING_KEY } from '@/utils/seasonalLogo';
import { getSeasonalLogos, replaceSeasonalLogos } from '../service';

const LIMIT = { max: 60, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'seasonal-logos',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => getSeasonalLogos(ctx),
  }),
  PUT: mutate({
    rateLimit: LIMIT,
    audit: 'settings_update',
    handler: async ({ req, ctx }) => {
      const view = await replaceSeasonalLogos(ctx, req.body);
      ctx.audit({
        entity_type: 'site_settings',
        entity_id: SEASONAL_LOGOS_SETTING_KEY,
        payload: {
          logos: view.logos.map((l) => ({
            name: l.name,
            startDate: l.startDate,
            endDate: l.endDate,
            enabled: l.enabled,
          })),
        },
      });
      return view;
    },
  }),
});
