// pages/api/admin/tenants/[id].ts
//
// S7 :
//  - GET    : detail d'un tenant + guilds + staff (manager+ OU staff du
//             tenant).
//  - PATCH  : edite name/default_locale/is_active (manager+). Le slug
//             n'est volontairement PAS modifiable (impacterait les URLs
//             publiques V2).
//  - DELETE : soft-delete (is_active = false). Le hard-delete est interdit
//             pour eviter les cascades RESTRICT (les ~32 tables tier 1/2
//             pointent sur tenants(id) avec ON DELETE RESTRICT). Le slug
//             `conference` est protege en dur (tenant historique).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant, PROTECTED_TENANT_SLUGS } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';

const NAME_MIN = 1;
const NAME_MAX = 200;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-tenants-id')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid id.' });
  }

  // ---------- GET ----------
  if (req.method === 'GET') {
    // Acces : manager+ globalement OU staff de ce tenant precis OU pole admin.
    const isManager = hasAtLeastRole(ctx.role, 'manager');
    if (!isManager) {
      const isPoleAdmin =
        (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
      const allowed = await canAccessTenant(ctx.staff.id, id, { isPoleAdmin });
      if (!allowed) {
        return res.status(403).json({ error: 'No access to this tenant.' });
      }
    }

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, is_active, default_locale, created_at')
      .eq('id', id)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

    const [{ data: guilds }, { data: staffRows }] = await Promise.all([
      supabaseAdmin
        .from('discord_guilds')
        .select('guild_id, is_primary, created_at')
        .eq('tenant_id', id),
      supabaseAdmin
        .from('tenant_staff')
        .select('staff_id, role, created_at')
        .eq('tenant_id', id),
    ]);

    type TenantStaffRow = {
      staff_id: string;
      role: string;
      created_at: string;
    };
    const ts = (staffRows as TenantStaffRow[] | null) ?? [];
    const staffIds = ts.map((r) => r.staff_id);

    let staffById = new Map<
      string,
      { id: string; email: string; display_name: string | null }
    >();
    if (staffIds.length > 0) {
      const { data: globals } = await supabaseAdmin
        .from('staff')
        .select('id, email, display_name')
        .in('id', staffIds);
      type GRow = { id: string; email: string; display_name: string | null };
      staffById = new Map(
        ((globals as GRow[] | null) ?? []).map((g) => [g.id, g])
      );
    }

    const staff = ts.map((r) => {
      const s = staffById.get(r.staff_id);
      return {
        staff_id: r.staff_id,
        role: r.role,
        created_at: r.created_at,
        email: s?.email ?? null,
        display_name: s?.display_name ?? null,
      };
    });

    return res.status(200).json({
      tenant,
      guilds: guilds ?? [],
      staff,
    });
  }

  // ---------- PATCH ----------
  if (req.method === 'PATCH') {
    // Owner-only : editer un tenant (name/locale/is_active) impacte tous
    // les utilisateurs scope dessus.
    if (!hasAtLeastRole(ctx.role, 'owner')) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < NAME_MIN || name.length > NAME_MAX) {
        return res
          .status(400)
          .json({ error: 'name must be 1-200 chars.', code: 'INVALID_NAME' });
      }
      update.name = name;
    }

    if ('default_locale' in body) {
      const loc =
        typeof body.default_locale === 'string'
          ? body.default_locale.trim()
          : '';
      if (!LOCALE_RE.test(loc)) {
        return res
          .status(400)
          .json({
            error: 'default_locale must be like "fr" or "en-US".',
            code: 'INVALID_LOCALE',
          });
      }
      update.default_locale = loc;
    }

    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') {
        return res
          .status(400)
          .json({
            error: 'is_active must be a boolean.',
            code: 'INVALID_IS_ACTIVE',
          });
      }
      update.is_active = body.is_active;
    }

    if ('slug' in body) {
      return res
        .status(400)
        .json({ error: 'slug is immutable.', code: 'SLUG_IMMUTABLE' });
    }

    if (Object.keys(update).length === 0) {
      return res
        .status(400)
        .json({ error: 'No fields to update.', code: 'NO_FIELDS' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('tenants')
      .update(update)
      .eq('id', id)
      .select('id, slug, name, is_active, default_locale, created_at')
      .single();

    if (error || !updated) {
      logger.error('[admin/tenants/[id]] update error', error);
      return res.status(500).json({ error: 'Failed to update the tenant.' });
    }

    return res.status(200).json({ tenant: updated });
  }

  // ---------- DELETE (soft) ----------
  if (req.method === 'DELETE') {
    // Owner-only : suppression (soft) d'un tenant.
    if (!hasAtLeastRole(ctx.role, 'owner')) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    // Protection : interdit pour le tenant historique (`conference`).
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, is_active, default_locale, created_at')
      .eq('id', id)
      .maybeSingle();

    if (lookupErr || !existing) {
      return res.status(404).json({ error: 'Tenant not found.' });
    }

    if (PROTECTED_TENANT_SLUGS.has(existing.slug)) {
      return res
        .status(403)
        .json({
          error: 'This tenant cannot be deleted.',
          code: 'TENANT_PROTECTED',
        });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('tenants')
      .update({ is_active: false })
      .eq('id', id)
      .select('id, slug, name, is_active, default_locale, created_at')
      .single();

    if (error || !updated) {
      logger.error('[admin/tenants/[id]] soft-delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to deactivate the tenant.' });
    }

    return res.status(200).json({ tenant: updated });
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenants-mutate' }),
  // caster : OK pour GET (gating fin a l'interieur). PATCH/DELETE
  // re-checkent manager+.
  'caster'
);
