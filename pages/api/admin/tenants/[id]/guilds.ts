// pages/api/admin/tenants/[id]/guilds.ts
//
// POST : rattache un serveur Discord à un espace.
//
// Pourquoi cet endpoint existe. Le seul chemin de rattachement était
// `POST /api/admin/pending-guild-links/:guildId/claim`, qui part du SERVEUR :
// il exige une ligne dans `pending_guild_links`, donc que le bot ait été invité
// et que personne n'ait purgé l'attente. Vu depuis l'espace — « cet espace n'a
// aucun serveur, rattache-le » — il n'y avait rien. C'est précisément la
// question que pose l'onglet « Espaces » du hub d'onboarding quand il affiche
// « aucun serveur Discord » : le manque était signalé, sans moyen de le régler.
//
// Ce que fait le POST :
//   - idempotent si le serveur est DÉJÀ rattaché à cet espace (200) ;
//   - refuse (409) un serveur rattaché à un AUTRE espace. Le déplacer
//     silencieusement couperait le bot de l'espace d'origine — c'est un geste
//     qui se fait en le détachant d'abord, explicitement ;
//   - `is_primary` seulement si l'espace n'a encore aucun serveur. Rien ne
//     l'impose en base, mais deux serveurs « principaux » pour un même espace
//     n'ont pas de sens et les résolveurs du bot en choisiraient un au hasard ;
//   - crée la ligne `tenant_discord_config` (vide) qui sert de cible à l'écran
//     de configuration, comme le fait l'auto-claim de l'onboarding ;
//   - purge l'éventuelle ligne d'attente pour ce serveur : elle vient d'être
//     traitée, la laisser afficherait un serveur « en attente » déjà rattaché.
//
// Le bot voit le nouveau rattachement au prochain rafraîchissement de son cache
// (`tenant-config`, ~5 min) ou à son prochain démarrage. Rien à redéployer.
//
// Portée : owner de la PLATEFORME (`manage_tenant` + `scope: 'platform'`),
// comme tout le hub d'onboarding.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { attachGuildToTenant } from '@/utils/tenants/attachGuild';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const GUILD_ID_RE = /^[0-9]{15,25}$/;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-tenant-attach-guild'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const guildId = typeof body.guild_id === 'string' ? body.guild_id : '';

  // Les règles vivent dans `utils/tenants/attachGuild.ts` : le retour du lien
  // d'invitation par espace les applique à l'identique. Deux copies auraient
  // fini par diverger sur la purge de l'attente ou le drapeau « principal ».
  const result = await attachGuildToTenant(id, guildId);
  if (!result.ok) {
    return res.status(result.httpStatus).json({
      error: result.error,
      code: result.code,
      ...(result.otherTenantSlug
        ? { tenant_slug: result.otherTenantSlug }
        : {}),
    });
  }

  if (result.status === 'already_linked') {
    // Déjà fait : on le dit sans erreur. Un double-clic ou un retry réseau ne
    // doit pas ressembler à un échec.
    return res.status(200).json({
      status: 'already_linked',
      guild_id: result.guildId,
      tenant: result.tenant,
      is_primary: result.isPrimary,
    });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'claim_guild_link',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: {
        guildId: result.guildId,
        tenantSlug: result.tenant.slug,
        tenantName: result.tenant.name,
        isPrimary: result.isPrimary,
        from: 'tenant_readiness',
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(claim_guild_link) error:', logErr);
  }

  return res.status(201).json({
    status: 'linked',
    guild_id: result.guildId,
    tenant: result.tenant,
    is_primary: result.isPrimary,
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenant-attach-guild' }),
  {
    // Rattacher un serveur, c'est de l'onboarding : owner de la PLATEFORME.
    // Sans la portée, le propriétaire d'un espace — qui porte `manage_tenant`
    // chez lui depuis l'élévation par `tenant_staff` — pourrait rattacher un
    // serveur à n'importe quel espace.
    permission: 'manage_tenant',
    scope: 'platform',
  }
);
