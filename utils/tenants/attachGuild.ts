// utils/tenants/attachGuild.ts
//
// Rattacher un serveur Discord à un espace — les règles, une seule fois.
//
// Elles vivaient dans `POST /api/admin/tenants/[id]/guilds`, qui en était le
// seul appelant. Le lien d'invitation par espace en ajoute un second : au
// retour de Discord, le serveur doit être rattaché exactement de la même façon.
// Recopier les six règles, c'était accepter que l'une des deux voies oublie un
// jour de purger l'attente, ou marque deux serveurs « principaux ».
//
// Les six règles, dans l'ordre où elles se posent :
//   1. l'espace existe et est un espace d'ORGANISATION (un espace développeur
//      porte des clés d'API, pas un tournoi — le bot lui est fermé) ;
//   2. déjà rattaché ICI → succès idempotent, pas une erreur : un double-clic
//      ou un rejeu réseau ne doit pas ressembler à un échec ;
//   3. rattaché AILLEURS → refus. Déplacer silencieusement couperait le bot de
//      l'espace d'origine ;
//   4. premier serveur de l'espace → `is_primary`. Rien ne l'impose en base,
//      mais deux principaux et les résolveurs du bot en choisissent un au
//      hasard ;
//   5. création de la ligne `tenant_discord_config`, cible de l'écran de
//      réglages ;
//   6. purge de l'attente : elle vient d'être traitée.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { assertOrganizerTenant } from '../tenantKind';

export const GUILD_ID_RE = /^[0-9]{15,25}$/;

export type AttachGuildResult =
  | {
      ok: true;
      status: 'linked' | 'already_linked';
      guildId: string;
      isPrimary: boolean;
      tenant: { id: string; slug: string; name: string };
    }
  | {
      ok: false;
      httpStatus: number;
      code:
        | 'INVALID_GUILD_ID'
        | 'UNKNOWN_TENANT'
        | 'DEVELOPER_TENANT_FORBIDDEN'
        | 'GUILD_TAKEN'
        | 'SERVER_ERROR';
      error: string;
      /** Espace qui détient déjà ce serveur, pour un message qui aide. */
      otherTenantSlug?: string | null;
    };

export async function attachGuildToTenant(
  tenantId: string,
  rawGuildId: string
): Promise<AttachGuildResult> {
  const guildId = (rawGuildId ?? '').trim();
  if (!GUILD_ID_RE.test(guildId)) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'INVALID_GUILD_ID',
      error: 'guild_id doit être un identifiant de serveur Discord.',
    };
  }

  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, is_active')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr) {
    logger.error('[attachGuild] tenant lookup error', tenantErr);
    return {
      ok: false,
      httpStatus: 500,
      code: 'SERVER_ERROR',
      error: 'Server error.',
    };
  }
  if (!tenant) {
    return {
      ok: false,
      httpStatus: 404,
      code: 'UNKNOWN_TENANT',
      error: 'Tenant not found.',
    };
  }
  if (!(await assertOrganizerTenant(tenantId))) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'DEVELOPER_TENANT_FORBIDDEN',
      error:
        'Un espace développeur ne pilote pas de serveur Discord : le bot lui est fermé.',
    };
  }

  const t = tenant as { id: string; slug: string; name: string };

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('discord_guilds')
    .select(
      'guild_id, tenant_id, is_primary, tenant:tenants!discord_guilds_tenant_id_fkey(slug, name)'
    )
    .eq('guild_id', guildId)
    .maybeSingle();
  if (existingErr) {
    logger.error('[attachGuild] existing link error', existingErr);
    return {
      ok: false,
      httpStatus: 500,
      code: 'SERVER_ERROR',
      error: 'Server error.',
    };
  }

  if (existing) {
    if (existing.tenant_id === tenantId) {
      return {
        ok: true,
        status: 'already_linked',
        guildId,
        isPrimary: existing.is_primary === true,
        tenant: t,
      };
    }
    const other = Array.isArray(existing.tenant)
      ? existing.tenant[0]
      : existing.tenant;
    return {
      ok: false,
      httpStatus: 409,
      code: 'GUILD_TAKEN',
      error: `Ce serveur est déjà rattaché à l'espace « ${other?.name ?? other?.slug ?? 'inconnu'} ». Détachez-le d'abord.`,
      otherTenantSlug: other?.slug ?? null,
    };
  }

  const { count: guildCount, error: countErr } = await supabaseAdmin
    .from('discord_guilds')
    .select('guild_id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (countErr) {
    logger.error('[attachGuild] guild count error', countErr);
    return {
      ok: false,
      httpStatus: 500,
      code: 'SERVER_ERROR',
      error: 'Server error.',
    };
  }
  const isPrimary = (guildCount ?? 0) === 0;

  const { error: insertErr } = await supabaseAdmin
    .from('discord_guilds')
    .insert({ guild_id: guildId, tenant_id: tenantId, is_primary: isPrimary });
  if (insertErr) {
    // Course : quelqu'un vient de rattacher ce serveur entre nos deux requêtes.
    if ((insertErr as { code?: string }).code === '23505') {
      return {
        ok: false,
        httpStatus: 409,
        code: 'GUILD_TAKEN',
        error: 'Ce serveur vient d’être rattaché ailleurs.',
      };
    }
    logger.error('[attachGuild] insert error', insertErr);
    return {
      ok: false,
      httpStatus: 500,
      code: 'SERVER_ERROR',
      error: 'Failed to link the guild.',
    };
  }

  // Best-effort : l'écran de réglages sait vivre sans (il fusionne avec des
  // valeurs vides), mais autant la créer ici.
  const { error: cfgErr } = await supabaseAdmin
    .from('tenant_discord_config')
    .upsert({ guild_id: guildId }, { onConflict: 'guild_id' });
  if (cfgErr) {
    logger.error('[attachGuild] discord_config upsert error', cfgErr);
  }

  const { error: pendingErr } = await supabaseAdmin
    .from('pending_guild_links')
    .delete()
    .eq('guild_id', guildId);
  if (pendingErr) {
    logger.error('[attachGuild] pending delete error', pendingErr);
  }

  return { ok: true, status: 'linked', guildId, isPrimary, tenant: t };
}
