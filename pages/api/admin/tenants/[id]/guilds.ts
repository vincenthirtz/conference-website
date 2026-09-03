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
import { assertOrganizerTenant } from '@/utils/tenantKind';
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
  const guildId = typeof body.guild_id === 'string' ? body.guild_id.trim() : '';
  if (!GUILD_ID_RE.test(guildId)) {
    return res.status(400).json({
      error: 'guild_id doit être un identifiant de serveur Discord.',
      code: 'INVALID_GUILD_ID',
    });
  }

  // L'espace doit exister — et être un espace d'organisation. Un espace
  // « développeur » porte des clés d'API, pas un tournoi : lui rattacher un
  // serveur Discord ne lui donnerait rien (le bot lui est fermé).
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, is_active')
    .eq('id', id)
    .maybeSingle();
  if (tenantErr) {
    logger.error('[admin/tenants/guilds] tenant lookup error', tenantErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }
  if (!(await assertOrganizerTenant(id))) {
    return res.status(400).json({
      error:
        'Un espace développeur ne pilote pas de serveur Discord : le bot lui est fermé.',
      code: 'DEVELOPER_TENANT_FORBIDDEN',
    });
  }

  // Ce serveur est-il déjà rattaché quelque part ?
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('discord_guilds')
    .select(
      'guild_id, tenant_id, is_primary, tenant:tenants!discord_guilds_tenant_id_fkey(slug, name)'
    )
    .eq('guild_id', guildId)
    .maybeSingle();
  if (existingErr) {
    logger.error('[admin/tenants/guilds] existing link error', existingErr);
    return res.status(500).json({ error: 'Server error.' });
  }

  if (existing) {
    if (existing.tenant_id === id) {
      // Déjà fait : on le dit sans erreur. Un double-clic ou un retry réseau
      // ne doit pas ressembler à un échec.
      return res.status(200).json({
        status: 'already_linked',
        guild_id: guildId,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        is_primary: existing.is_primary,
      });
    }
    const other = Array.isArray(existing.tenant)
      ? existing.tenant[0]
      : existing.tenant;
    return res.status(409).json({
      error: `Ce serveur est déjà rattaché à l'espace « ${other?.name ?? other?.slug ?? 'inconnu'} ». Détachez-le d'abord.`,
      code: 'GUILD_TAKEN',
      tenant_slug: other?.slug ?? null,
    });
  }

  // Premier serveur de l'espace → c'est le principal. Les suivants ne le sont
  // pas : c'est ce que les résolveurs du bot attendent.
  const { count: guildCount, error: countErr } = await supabaseAdmin
    .from('discord_guilds')
    .select('guild_id', { count: 'exact', head: true })
    .eq('tenant_id', id);
  if (countErr) {
    logger.error('[admin/tenants/guilds] guild count error', countErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  const isPrimary = (guildCount ?? 0) === 0;

  const { error: insertErr } = await supabaseAdmin
    .from('discord_guilds')
    .insert({ guild_id: guildId, tenant_id: id, is_primary: isPrimary });
  if (insertErr) {
    // Course : quelqu'un vient de rattacher ce serveur entre nos deux requêtes.
    if ((insertErr as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'Ce serveur vient d’être rattaché ailleurs.',
        code: 'GUILD_TAKEN',
      });
    }
    logger.error('[admin/tenants/guilds] insert error', insertErr);
    return res.status(500).json({ error: 'Failed to link the guild.' });
  }

  // Ligne de configuration Discord : cible du formulaire de réglages. Même
  // geste que l'auto-claim de l'onboarding. Best-effort — l'écran sait vivre
  // sans (il fusionne avec des valeurs vides), mais autant la créer ici.
  const { error: cfgErr } = await supabaseAdmin
    .from('tenant_discord_config')
    .upsert({ guild_id: guildId }, { onConflict: 'guild_id' });
  if (cfgErr) {
    logger.error('[admin/tenants/guilds] discord_config upsert error', cfgErr);
  }

  // L'attente est traitée : la laisser afficherait un serveur « en attente »
  // qui est en réalité rattaché.
  const { error: pendingErr } = await supabaseAdmin
    .from('pending_guild_links')
    .delete()
    .eq('guild_id', guildId);
  if (pendingErr) {
    logger.error('[admin/tenants/guilds] pending delete error', pendingErr);
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'claim_guild_link',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: {
        guildId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        isPrimary,
        from: 'tenant_readiness',
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(claim_guild_link) error:', logErr);
  }

  return res.status(201).json({
    status: 'linked',
    guild_id: guildId,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    is_primary: isPrimary,
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
