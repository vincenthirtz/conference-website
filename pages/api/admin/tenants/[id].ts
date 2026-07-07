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
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { canAccessTenant, PROTECTED_TENANT_SLUGS } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';

const NAME_MIN = 1;
const NAME_MAX = 200;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HOSTNAME_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

// Colonnes renvoyees au client pour le detail d'un tenant (inclut la marque
// blanche : logo/couleurs/domaine personnalise).
const TENANT_DETAIL_COLUMNS =
  'id, slug, name, is_active, default_locale, logo_url, primary_color, accent_color, custom_domain, created_at';

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
      .select(TENANT_DETAIL_COLUMNS)
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

    // ---- Marque blanche (white-label) ----
    if ('logo_url' in body) {
      const raw =
        typeof body.logo_url === 'string' ? body.logo_url.trim() : '';
      if (!raw) {
        update.logo_url = null;
      } else if (raw.startsWith('/') && !raw.startsWith('//')) {
        // Chemin relatif au site (ex : /uploads/logo.png).
        update.logo_url = raw;
      } else {
        const safe = sanitizeUrl(raw);
        if (!safe) {
          return res.status(400).json({
            error:
              'logo_url must be a valid http(s) URL or a site-relative path.',
            code: 'INVALID_LOGO_URL',
          });
        }
        update.logo_url = safe;
      }
    }

    if ('primary_color' in body) {
      const raw =
        typeof body.primary_color === 'string'
          ? body.primary_color.trim()
          : '';
      if (!raw) {
        update.primary_color = null;
      } else if (!HEX_RE.test(raw)) {
        return res.status(400).json({
          error: 'primary_color must be a hex color like #7c3aed.',
          code: 'INVALID_PRIMARY_COLOR',
        });
      } else {
        update.primary_color = raw;
      }
    }

    if ('accent_color' in body) {
      const raw =
        typeof body.accent_color === 'string' ? body.accent_color.trim() : '';
      if (!raw) {
        update.accent_color = null;
      } else if (!HEX_RE.test(raw)) {
        return res.status(400).json({
          error: 'accent_color must be a hex color like #22d3ee.',
          code: 'INVALID_ACCENT_COLOR',
        });
      } else {
        update.accent_color = raw;
      }
    }

    if ('custom_domain' in body) {
      const raw =
        typeof body.custom_domain === 'string'
          ? body.custom_domain.trim().toLowerCase()
          : '';
      if (!raw) {
        update.custom_domain = null;
      } else if (!HOSTNAME_RE.test(raw)) {
        return res.status(400).json({
          error: 'custom_domain must be a valid hostname (no scheme or path).',
          code: 'INVALID_CUSTOM_DOMAIN',
        });
      } else {
        update.custom_domain = raw;
      }
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
      .select(TENANT_DETAIL_COLUMNS)
      .single();

    if (error || !updated) {
      // Violation d'unicite sur custom_domain (deja pris par un autre tenant).
      const pgCode = (error as { code?: string } | null)?.code;
      if (pgCode === '23505') {
        return res.status(409).json({
          error:
            'Ce domaine personnalisé est déjà utilisé par un autre tenant.',
          code: 'CUSTOM_DOMAIN_TAKEN',
        });
      }
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
      .select(TENANT_DETAIL_COLUMNS)
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
      .select(TENANT_DETAIL_COLUMNS)
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
