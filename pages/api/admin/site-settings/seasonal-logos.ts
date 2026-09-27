// /api/admin/site-settings/seasonal-logos
//
// Le calendrier des logos d'événement (Octobre rose, Halloween, Noël…).
//
//   GET → { logos, activeId, today }
//   PUT { logos } → remplace la liste ENTIÈRE, validée
//
// La liste est écrite d'un bloc plutôt qu'entrée par entrée : l'écran édite un
// calendrier, et deux entrées ne se valident pas indépendamment (identifiants
// uniques, plafond). La logique vit dans utils/seasonalLogo.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { getSetting, setSetting } from '@/utils/siteSettings';
import {
  SEASONAL_LOGOS_SETTING_KEY,
  SeasonalLogoListSchema,
  parseSeasonalLogos,
  pickActiveSeasonalLogo,
  todayInParis,
} from '@/utils/seasonalLogo';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-seasonal-logos'
    )
  )
    return;

  if (req.method === 'GET') {
    const logos = parseSeasonalLogos(
      await getSetting(SEASONAL_LOGOS_SETTING_KEY, ctx.tenantId)
    );
    const today = todayInParis();
    return res.status(200).json({
      logos,
      activeId: pickActiveSeasonalLogo(logos, today)?.id ?? null,
      today,
    });
  }

  if (req.method === 'PUT') {
    const parsed = SeasonalLogoListSchema.safeParse(
      (req.body as { logos?: unknown } | undefined)?.logos
    );
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Liste invalide.',
        code: 'invalid_body',
      });
    }
    const logos = parsed.data;

    const ok = await setSetting(
      SEASONAL_LOGOS_SETTING_KEY,
      JSON.stringify(logos),
      {
        tenantId: ctx.tenantId,
        description: "Logos d'événement programmés (Octobre rose, Noël…)",
        updatedBy: ctx.staff.id,
      }
    );
    if (!ok) {
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }

    await logStaffAction({
      staff_id: ctx.staff.id,
      tenant_id: ctx.tenantId,
      action: 'settings_update',
      entity_type: 'site_settings',
      entity_id: SEASONAL_LOGOS_SETTING_KEY,
      payload: {
        logos: logos.map((l) => ({
          name: l.name,
          startDate: l.startDate,
          endDate: l.endDate,
          enabled: l.enabled,
        })),
      },
    });

    const today = todayInParis();
    return res.status(200).json({
      logos,
      activeId: pickActiveSeasonalLogo(logos, today)?.id ?? null,
      today,
    });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, { permission: 'manage_settings' });
