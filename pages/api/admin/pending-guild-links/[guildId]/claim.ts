// pages/api/admin/pending-guild-links/[guildId]/claim.ts
//
// S7 : assigne un guild en attente a un tenant existant OU cree un
// nouveau tenant et l'assigne en atomique.
//
// Body :
//   { tenant_id: uuid }                      → assigne a un tenant existant
//   OU
//   { new_tenant: { slug, name, default_locale? } }
//                                            → cree + assigne
//
// Effet : INSERT dans discord_guilds (is_primary=true) + DELETE dans
// pending_guild_links. Pas de transaction native Supabase via PostgREST,
// donc on fait le delete apres la verification de succes de l'insert
// (defensif : si le bot retry, le pending est deja absent → fallback
// rendu transparent par `already_linked` cote bot).
//
// Manager+ requis.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { logStaffAction } from '@/utils/staffLogs';

const GUILD_ID_RE = /^[0-9]{15,25}$/;
const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MIN = 2;
const SLUG_MAX = 50;
const NAME_MIN = 1;
const NAME_MAX = 200;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string;
};

async function resolveTargetTenant(
  body: Record<string, unknown>
): Promise<
  | { ok: true; tenant: ResolvedTenant; created: boolean }
  | { ok: false; status: number; code: string; error: string }
> {
  const tenantId = body.tenant_id;
  const newTenant = body.new_tenant;

  if (typeof tenantId === 'string') {
    if (!isValidUUID(tenantId)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_TENANT_ID',
        error: 'tenant_id must be a UUID.',
      };
    }
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, is_active, default_locale')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        status: 404,
        code: 'TENANT_NOT_FOUND',
        error: 'Target tenant not found.',
      };
    }
    return { ok: true, tenant: data as ResolvedTenant, created: false };
  }

  if (newTenant && typeof newTenant === 'object' && !Array.isArray(newTenant)) {
    const nt = newTenant as Record<string, unknown>;
    const slug =
      typeof nt.slug === 'string' ? nt.slug.trim().toLowerCase() : '';
    const name = typeof nt.name === 'string' ? nt.name.trim() : '';
    const defaultLocale =
      typeof nt.default_locale === 'string' && nt.default_locale.trim()
        ? nt.default_locale.trim()
        : 'fr';

    if (
      !SLUG_RE.test(slug) ||
      slug.length < SLUG_MIN ||
      slug.length > SLUG_MAX
    ) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_SLUG',
        error: 'new_tenant.slug must match ^[a-z0-9-]+$ and be 2-50 chars.',
      };
    }
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_NAME',
        error: 'new_tenant.name must be 1-200 chars.',
      };
    }
    if (!LOCALE_RE.test(defaultLocale)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_LOCALE',
        error: 'new_tenant.default_locale must be like "fr".',
      };
    }

    const { data: created, error } = await supabaseAdmin
      .from('tenants')
      .insert({ slug, name, default_locale: defaultLocale, is_active: true })
      .select('id, slug, name, is_active, default_locale')
      .single();
    if (error || !created) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '23505') {
        return {
          ok: false,
          status: 409,
          code: 'DUPLICATE_SLUG',
          error: 'A tenant with this slug already exists.',
        };
      }
      logger.error(
        '[admin/pending-guild-links/[guildId]/claim] create tenant error',
        error
      );
      return {
        ok: false,
        status: 500,
        code: 'TENANT_CREATE_FAILED',
        error: 'Failed to create the new tenant.',
      };
    }
    return { ok: true, tenant: created as ResolvedTenant, created: true };
  }

  return {
    ok: false,
    status: 400,
    code: 'MISSING_TARGET',
    error: 'Provide either tenant_id (existing) or new_tenant (to create).',
  };
}

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
      'admin-pending-guild-claim'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { guildId } = req.query;
  if (!guildId || typeof guildId !== 'string' || !GUILD_ID_RE.test(guildId)) {
    return res
      .status(400)
      .json({ error: 'Invalid guildId.', code: 'INVALID_GUILD_ID' });
  }

  // Verifier que le guild est bien en pending.
  const { data: pending, error: pErr } = await supabaseAdmin
    .from('pending_guild_links')
    .select('guild_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  if (pErr) {
    logger.error(
      '[admin/pending-guild-links/[guildId]/claim] pending lookup error',
      pErr
    );
    return res.status(500).json({ error: 'Failed to verify pending state.' });
  }
  if (!pending) {
    return res
      .status(404)
      .json({ error: 'No pending link for this guild.', code: 'NOT_PENDING' });
  }

  // Verifier qu'il n'est pas deja linke (race conditions / desync).
  const { data: existingLink, error: linkErr } = await supabaseAdmin
    .from('discord_guilds')
    .select('guild_id, tenant_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  if (linkErr) {
    logger.error(
      '[admin/pending-guild-links/[guildId]/claim] existing link lookup error',
      linkErr
    );
    return res.status(500).json({ error: 'Failed to check existing link.' });
  }
  if (existingLink) {
    // On nettoie quand meme le pending pour stabiliser l'etat.
    await supabaseAdmin
      .from('pending_guild_links')
      .delete()
      .eq('guild_id', guildId);
    return res.status(409).json({
      error: 'Guild already linked.',
      code: 'ALREADY_LINKED',
      tenant_id: existingLink.tenant_id,
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const resolved = await resolveTargetTenant(body);
  if (!resolved.ok) {
    return res
      .status(resolved.status)
      .json({ error: resolved.error, code: resolved.code });
  }

  // INSERT discord_guilds.
  const { error: insertErr } = await supabaseAdmin
    .from('discord_guilds')
    .insert({
      guild_id: guildId,
      tenant_id: resolved.tenant.id,
      is_primary: true,
    });
  if (insertErr) {
    logger.error(
      '[admin/pending-guild-links/[guildId]/claim] insert guild error',
      insertErr
    );
    return res.status(500).json({ error: 'Failed to link the guild.' });
  }

  // Si on a cree un tenant a la volee, on ajoute le createur dans
  // tenant_staff (sinon il ne pourrait pas switcher dessus).
  if (resolved.created) {
    const { error: tsErr } = await supabaseAdmin.from('tenant_staff').upsert(
      {
        tenant_id: resolved.tenant.id,
        staff_id: ctx.staff.id,
        role: 'admin',
      },
      { onConflict: 'tenant_id,staff_id' }
    );
    if (tsErr) {
      logger.error(
        '[admin/pending-guild-links/[guildId]/claim] tenant_staff insert error',
        tsErr
      );
    }
  }

  // DELETE pending_guild_links (best-effort).
  const { error: delErr } = await supabaseAdmin
    .from('pending_guild_links')
    .delete()
    .eq('guild_id', guildId);
  if (delErr) {
    logger.error(
      '[admin/pending-guild-links/[guildId]/claim] delete pending error',
      delErr
    );
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'claim_guild_link',
        entity_type: 'tenant',
        entity_id: resolved.tenant.id,
        tenant_id: ctx.tenantId,
        payload: {
          guildId,
          tenantSlug: resolved.tenant.slug,
          tenantName: resolved.tenant.name,
          createdTenant: resolved.created,
        },
      });
    } catch (logErr) {
      logger.error('logStaffAction(claim_guild_link) error:', logErr);
    }
  }

  return res.status(200).json({
    guild_id: guildId,
    tenant: resolved.tenant,
    created_tenant: resolved.created,
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-pending-guild-claim' }),
  { permission: 'manage_tenant' }
);
