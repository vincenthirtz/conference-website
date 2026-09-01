// pages/api/admin/tenants/index.ts
//
// S7 :
//  - GET  : liste tous les tenants (visibilite globale, role manager+).
//          Annote chaque row avec guild_count et staff_count.
//  - POST : cree un tenant + ajoute automatiquement le createur dans
//          `tenant_staff` (role 'admin') pour qu'il puisse switcher
//          immediatement dessus.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  requireOwner,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { logStaffAction } from '@/utils/staffLogs';
import { assertOrganizerTenant } from '@/utils/tenantKind';

const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MIN = 2;
const SLUG_MAX = 50;
const NAME_MIN = 1;
const NAME_MAX = 200;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string;
  created_at: string;
  plan: string;
  plan_status: string;
  plan_expires_at: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-tenants-list'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select(
        'id, slug, name, is_active, default_locale, created_at, plan, plan_status, plan_expires_at'
      )
      .order('slug', { ascending: true });

    if (error) {
      logger.error('[admin/tenants] list error', error);
      return res.status(500).json({ error: 'Failed to load tenants.' });
    }

    const rows = (tenants ?? []) as TenantRow[];

    // Annote chaque tenant avec guild_count + staff_count. On fait 2 requetes
    // groupees plutot que N+1 — le volume est < 100 tenants attendu.
    const tenantIds = rows.map((t) => t.id);

    const [{ data: guilds }, { data: staffRows }] = await Promise.all([
      tenantIds.length === 0
        ? Promise.resolve({ data: [] as Array<{ tenant_id: string }> })
        : supabaseAdmin
            .from('discord_guilds')
            .select('tenant_id')
            .in('tenant_id', tenantIds),
      tenantIds.length === 0
        ? Promise.resolve({ data: [] as Array<{ tenant_id: string }> })
        : supabaseAdmin
            .from('tenant_staff')
            .select('tenant_id')
            .in('tenant_id', tenantIds),
    ]);

    const guildCount = new Map<string, number>();
    for (const g of (guilds ?? []) as Array<{ tenant_id: string }>) {
      guildCount.set(g.tenant_id, (guildCount.get(g.tenant_id) ?? 0) + 1);
    }
    const staffCount = new Map<string, number>();
    for (const s of (staffRows ?? []) as Array<{ tenant_id: string }>) {
      staffCount.set(s.tenant_id, (staffCount.get(s.tenant_id) ?? 0) + 1);
    }

    return res.status(200).json({
      tenants: rows.map((t) => ({
        ...t,
        guild_count: guildCount.get(t.id) ?? 0,
        staff_count: staffCount.get(t.id) ?? 0,
      })),
    });
  }

  if (req.method === 'POST') {
    // Owner-only : creation d'un tenant est une operation strategique.
    if (!requireOwner(ctx, res)) return;

    // Garde anti-cross-tenant : un compte « développeur » (tenant actif
    // kind='developer') est un owner confine a SON tenant — il ne doit pas
    // pouvoir creer des tenants organisateurs.
    if (!(await assertOrganizerTenant(ctx.tenantId))) {
      return res.status(403).json({
        error: 'Les comptes développeur ne peuvent pas créer de tenant.',
        code: 'DEVELOPER_TENANT_FORBIDDEN',
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const slug =
      typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const defaultLocale =
      typeof body.default_locale === 'string' && body.default_locale.trim()
        ? body.default_locale.trim()
        : 'fr';

    if (
      !SLUG_RE.test(slug) ||
      slug.length < SLUG_MIN ||
      slug.length > SLUG_MAX
    ) {
      return res.status(400).json({
        error: 'slug must match ^[a-z0-9-]+$ and be 2-50 chars.',
        code: 'INVALID_SLUG',
      });
    }
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      return res
        .status(400)
        .json({ error: 'name must be 1-200 chars.', code: 'INVALID_NAME' });
    }
    if (!LOCALE_RE.test(defaultLocale)) {
      return res.status(400).json({
        error: 'default_locale must be like "fr" or "en-US".',
        code: 'INVALID_LOCALE',
      });
    }

    // 1) Insert tenant.
    const { data: created, error: insertErr } = await supabaseAdmin
      .from('tenants')
      .insert({ slug, name, default_locale: defaultLocale, is_active: true })
      .select('id, slug, name, is_active, default_locale, created_at')
      .single();

    if (insertErr || !created) {
      // Unique violation slug → 409.
      const code = (insertErr as { code?: string } | null)?.code;
      if (code === '23505') {
        return res.status(409).json({
          error: 'A tenant with this slug already exists.',
          code: 'DUPLICATE_SLUG',
        });
      }
      logger.error('[admin/tenants] insert error', insertErr);
      return res.status(500).json({ error: 'Failed to create the tenant.' });
    }

    // 2) Auto-add createur dans tenant_staff (role 'admin') pour qu'il
    // puisse switcher dessus immediatement. Best-effort.
    const { error: staffInsertErr } = await supabaseAdmin
      .from('tenant_staff')
      .upsert(
        { tenant_id: created.id, staff_id: ctx.staff.id, role: 'admin' },
        { onConflict: 'tenant_id,staff_id' }
      );
    if (staffInsertErr) {
      logger.error(
        '[admin/tenants] tenant_staff auto-insert error',
        staffInsertErr
      );
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_tenant',
          entity_type: 'tenant',
          entity_id: created.id,
          tenant_id: ctx.tenantId,
          payload: {
            name: created.name,
            slug: created.slug,
            default_locale: created.default_locale,
          },
        });
      } catch (logErr) {
        logger.error('logStaffAction(create_tenant) error:', logErr);
      }
    }

    return res.status(201).json({ tenant: created });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenants-create' }),
  { permission: 'manage_settings' }
);
