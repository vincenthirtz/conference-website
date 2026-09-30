// features/admin/tenants/service/tenants.ts — l'espace lui-même : espace
// actif, liste / création / fiche / désactivation, cycle de vie, export,
// rattachement d'un serveur, lien d'invitation du bot, supervision (usage,
// mise en service, vue d'ensemble).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { Database } from '@/types/database.generated';
import { sanitizeUrl } from '@/utils/apiHelpers';
import {
  canAccessTenant,
  isValidTenantUuid,
  listAccessibleTenants,
  PROTECTED_TENANT_SLUGS,
} from '@/utils/adminTenants';
import { hasAtLeastRole } from '@/utils/staffRoles';
import { buildTrialFields } from '@/utils/billing/trial';
import { assertOrganizerTenant } from '@/utils/tenantKind';
import { resetNetworkSharingCache } from '@/utils/tenants/networkSharing';
import {
  effectivePlan,
  getPlanFeatures,
  tenantHasCapability,
  type PlanStatus,
  type TenantPlan,
} from '@/utils/billing/planFeatures';
import { generateDomainToken } from '@/utils/tenants/domainVerification';
import { invalidateTenantHostCache } from '@/utils/tenant';
import {
  invalidateLifecycleCache,
  LIFECYCLE_STATES,
  type LifecycleState,
} from '@/utils/tenants/lifecycle';
import { EXPORTABLE_TABLES } from '@/utils/tenants/tenantTables';
import { buildTenantBotInvite } from '@/utils/tenants/botInvite';
import { attachGuildToTenant, GUILD_ID_RE } from '@/utils/tenants/attachGuild';
import { monthKey } from '@/utils/billing/apiQuota';
import { buildBotInviteUrl } from '@/utils/onboard';
import {
  computeBlockers,
  countConfiguredKeys,
  CONFIG_KEYS,
} from '@/utils/tenants/readinessRules';
import {
  LIFE_SIGNS,
  TENANT_DOMAINS,
  type LifeSignKey,
  type TenantDomainKey,
} from '@/utils/tenants/tenantScope';
import { assertPlanLimit } from '@/utils/billing/planLimits';
import { CGV_VERSION } from '@/utils/billing/cgv';
import * as z from 'zod';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/tenants';
import {
  type StaffScope,
  assertTenantInScope,
  assertOwner,
  requireUuid,
  serverError,
} from './scope';

type TenantUpdate = Database['public']['Tables']['tenants']['Update'];
const DAY_MS = 86_400_000;

/* ----------------------------- espace actif ---------------------------- */

/** GET /api/admin/active-tenant */
export async function getActiveTenant(ctx: ServiceContext, source: string) {
  const { row, error } = await repo.getActiveTenant(ctx.db, ctx.tenantId);
  if (error) ctx.logger.error('[admin/active-tenant] fetch error', error);
  if (!row) throw new LegacyAdminError(404, 'Active tenant not found.');
  return { tenant: row, source };
}

/**
 * POST /api/admin/active-tenant — vérifie l'accès (`canAccessTenant`) ; la
 * route pose le cookie `staff_active_tenant_id`.
 */
export async function switchActiveTenant(
  ctx: ServiceContext,
  scope: StaffScope,
  body: unknown
) {
  const b = (body ?? {}) as Record<string, unknown>;
  const target = typeof b.tenant_id === 'string' ? b.tenant_id.trim() : '';
  if (!isValidTenantUuid(target)) {
    throw new LegacyAdminError(400, 'tenant_id must be a valid UUID.', {
      code: 'INVALID_TENANT_ID',
    });
  }
  if (!(await canAccessTenant(scope.staffId, target))) {
    throw new LegacyAdminError(403, 'No access to this tenant.', {
      code: 'NO_ACCESS_TO_TENANT',
    });
  }
  const { row, error } = await repo.getActiveTenant(ctx.db, target);
  if (error) ctx.logger.error('[admin/active-tenant] fetch error', error);
  if (!row) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'TENANT_NOT_FOUND',
    });
  }
  return { tenantId: target, tenant: row };
}

/* ------------------------------ liste / création ----------------------- */

const SLUG_RE = /^[a-z0-9-]+$/;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const HOSTNAME_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * GET /api/admin/tenants — le staff de la PLATEFORME (admin+ global ou
 * pôle-admin) voit tout ; un propriétaire d'espace, seulement les siens.
 */
export async function listTenants(ctx: ServiceContext, scope: StaffScope) {
  const { rows: all, error } = await repo.listTenants(ctx.db);
  if (error) {
    ctx.logger.error('[admin/tenants] list error', error);
    throw serverError('Failed to load tenants.');
  }
  let rows = all;
  if (!(scope.isPoleAdmin || hasAtLeastRole(scope.globalRole, 'admin'))) {
    const accessible = await listAccessibleTenants(scope.staffId, {
      isPoleAdmin: false,
    });
    const allowed = new Set(accessible.map((t) => t.id));
    rows = rows.filter((t) => allowed.has(t.id));
  }
  const ids = rows.map((t) => t.id);
  const [{ data: guilds }, { data: staffRows }] =
    ids.length === 0
      ? [{ data: [] }, { data: [] }]
      : await repo.countTenantGuildsAndStaff(ctx.db, ids);
  const count = (list: Array<{ tenant_id: string }> | null) => {
    const m = new Map<string, number>();
    for (const r of list ?? [])
      m.set(r.tenant_id, (m.get(r.tenant_id) ?? 0) + 1);
    return m;
  };
  const guildCount = count(guilds);
  const staffCount = count(staffRows);
  return {
    tenants: rows.map((t) => ({
      ...t,
      guild_count: guildCount.get(t.id) ?? 0,
      staff_count: staffCount.get(t.id) ?? 0,
    })),
  };
}

/**
 * POST /api/admin/tenants — owner-only ; refusé à un compte développeur ;
 * l'espace naît AVEC l'essai gratuit, le créateur y est rattaché (admin).
 */
export async function createTenant(
  ctx: ServiceContext,
  scope: StaffScope,
  body: unknown
) {
  assertOwner(scope);
  if (!(await assertOrganizerTenant(scope.tenantId))) {
    throw new LegacyAdminError(
      403,
      'Les comptes développeur ne peuvent pas créer de tenant.',
      { code: 'DEVELOPER_TENANT_FORBIDDEN' }
    );
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const defaultLocale =
    typeof b.default_locale === 'string' && b.default_locale.trim()
      ? b.default_locale.trim()
      : 'fr';
  if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 50) {
    throw new LegacyAdminError(
      400,
      'slug must match ^[a-z0-9-]+$ and be 2-50 chars.',
      { code: 'INVALID_SLUG' }
    );
  }
  if (name.length < 1 || name.length > 200) {
    throw new LegacyAdminError(400, 'name must be 1-200 chars.', {
      code: 'INVALID_NAME',
    });
  }
  if (!LOCALE_RE.test(defaultLocale)) {
    throw new LegacyAdminError(
      400,
      'default_locale must be like "fr" or "en-US".',
      { code: 'INVALID_LOCALE' }
    );
  }
  const { row: created, error } = await repo.insertTenant(ctx.db, {
    slug,
    name,
    default_locale: defaultLocale,
    is_active: true,
    ...buildTrialFields(),
  });
  if (error || !created) {
    if ((error as { code?: string } | null)?.code === '23505') {
      throw new LegacyAdminError(
        409,
        'A tenant with this slug already exists.',
        {
          code: 'DUPLICATE_SLUG',
        }
      );
    }
    ctx.logger.error('[admin/tenants] insert error', error);
    throw serverError('Failed to create the tenant.');
  }
  // Rattachement du créateur : best-effort.
  const { error: linkErr } = await repo.upsertTenantStaff(ctx.db, {
    tenant_id: created.id,
    staff_id: scope.staffId,
    role: 'admin',
  });
  if (linkErr) {
    ctx.logger.error('[admin/tenants] tenant_staff auto-insert error', linkErr);
  }
  return {
    result: { tenant: created },
    audit: {
      entity_type: 'tenant',
      entity_id: created.id,
      payload: {
        name: created.name,
        slug: created.slug,
        default_locale: created.default_locale,
      },
    },
  } satisfies Audited<unknown>;
}

/* ------------------------------ fiche --------------------------------- */

function detailId(raw: unknown): string {
  return requireUuid(raw, 'Invalid id.');
}

/** GET /api/admin/tenants/[id] — admin+ (effectif) ou staff de CET espace. */
export async function getTenantDetail(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = detailId(rawId);
  await assertTenantInScope(scope, id);
  const { row: tenant, error } = await repo.getTenantDetail(ctx.db, id);
  if (error || !tenant) throw new LegacyAdminError(404, 'Tenant not found.');
  const [{ rows: guilds }, { rows: links }] = await Promise.all([
    repo.listTenantGuilds(ctx.db, id),
    repo.listTenantStaff(ctx.db, id),
  ]);
  return { tenant, guilds, staff: await withIdentities(ctx, links) };
}

/** Joint email + nom d'affichage aux lignes `tenant_staff`. */
export async function withIdentities(
  ctx: ServiceContext,
  links: Array<{ staff_id: string; role: string; created_at: string }>
) {
  const ids = links.map((r) => r.staff_id);
  const byId = new Map(
    (ids.length > 0 ? await repo.listStaffIdentities(ctx.db, ids) : []).map(
      (g) => [g.id, g]
    )
  );
  return links.map((r) => {
    const s = byId.get(r.staff_id);
    return {
      staff_id: r.staff_id,
      role: r.role,
      created_at: r.created_at,
      email: s?.email ?? null,
      display_name: s?.display_name ?? null,
    };
  });
}

/** PATCH /api/admin/tenants/[id] — owner-only ; le slug est immuable. */
export async function updateTenant(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const id = detailId(rawId);
  assertOwner(scope);
  await assertTenantInScope(scope, id);
  const b = (body ?? {}) as Record<string, unknown>;
  const update: TenantUpdate = {};

  if ('name' in b) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (name.length < 1 || name.length > 200) {
      throw new LegacyAdminError(400, 'name must be 1-200 chars.', {
        code: 'INVALID_NAME',
      });
    }
    update.name = name;
  }
  if ('default_locale' in b) {
    const loc =
      typeof b.default_locale === 'string' ? b.default_locale.trim() : '';
    if (!LOCALE_RE.test(loc)) {
      throw new LegacyAdminError(
        400,
        'default_locale must be like "fr" or "en-US".',
        { code: 'INVALID_LOCALE' }
      );
    }
    update.default_locale = loc;
  }
  if ('is_active' in b) {
    if (typeof b.is_active !== 'boolean') {
      throw new LegacyAdminError(400, 'is_active must be a boolean.', {
        code: 'INVALID_IS_ACTIVE',
      });
    }
    update.is_active = b.is_active;
  }
  // Réseau entre espaces volontaires : la réciprocité s'applique à la lecture.
  for (const field of [
    'network_share_scrims',
    'network_share_recruitment',
  ] as const) {
    if (field in b) {
      const v = b[field];
      if (typeof v !== 'boolean') {
        throw new LegacyAdminError(400, `${field} must be a boolean.`, {
          code: 'INVALID_NETWORK_SHARING',
        });
      }
      update[field] = v;
    }
  }
  // Marque blanche.
  if ('logo_url' in b) {
    const raw = typeof b.logo_url === 'string' ? b.logo_url.trim() : '';
    if (!raw) update.logo_url = null;
    else if (raw.startsWith('/') && !raw.startsWith('//'))
      update.logo_url = raw;
    else {
      const safe = sanitizeUrl(raw);
      if (!safe) {
        throw new LegacyAdminError(
          400,
          'logo_url must be a valid http(s) URL or a site-relative path.',
          { code: 'INVALID_LOGO_URL' }
        );
      }
      update.logo_url = safe;
    }
  }
  for (const [field, example, code] of [
    ['primary_color', '#7c3aed', 'INVALID_PRIMARY_COLOR'],
    ['accent_color', '#22d3ee', 'INVALID_ACCENT_COLOR'],
  ] as const) {
    if (field in b) {
      const v = b[field];
      const raw = typeof v === 'string' ? v.trim() : '';
      if (!raw) update[field] = null;
      else if (!HEX_RE.test(raw)) {
        throw new LegacyAdminError(
          400,
          `${field} must be a hex color like ${example}.`,
          { code }
        );
      } else update[field] = raw;
    }
  }
  if ('custom_domain' in b) {
    const raw =
      typeof b.custom_domain === 'string'
        ? b.custom_domain.trim().toLowerCase()
        : '';
    if (!raw) {
      // Retirer le domaine efface aussi sa preuve.
      update.custom_domain = null;
      update.custom_domain_state = null;
      update.custom_domain_token = null;
      update.custom_domain_checked_at = null;
      update.custom_domain_error = null;
    } else if (!HOSTNAME_RE.test(raw)) {
      throw new LegacyAdminError(
        400,
        'custom_domain must be a valid hostname (no scheme or path).',
        { code: 'INVALID_CUSTOM_DOMAIN' }
      );
    } else {
      // Poser un domaine propre est une capacité `whiteLabel`.
      const p = (await repo.getTenantPlanAndDomain(ctx.db, id)) ?? {
        plan: null,
        plan_status: null,
        plan_expires_at: null,
        custom_domain: null,
      };
      const allowed = tenantHasCapability(
        {
          plan: (p.plan ?? 'discovery') as TenantPlan,
          plan_status: (p.plan_status ?? 'active') as PlanStatus,
          plan_expires_at: p.plan_expires_at ?? null,
        },
        'whiteLabel',
        Date.now()
      );
      if (!allowed) {
        throw new LegacyAdminError(
          402,
          'Le domaine propre fait partie des plans « Régie » et au-dessus.',
          { code: 'PLAN_LIMIT_REACHED', extra: { limit: 'customDomain' } }
        );
      }
      update.custom_domain = raw;
      // Posé n'est pas prouvé : en attente, avec son jeton (jamais rendu ici).
      if (raw !== (p.custom_domain ?? null)) {
        update.custom_domain_state = 'pending';
        update.custom_domain_token = generateDomainToken();
        update.custom_domain_checked_at = null;
        update.custom_domain_error = null;
      }
    }
  }
  if ('slug' in b) {
    throw new LegacyAdminError(400, 'slug is immutable.', {
      code: 'SLUG_IMMUTABLE',
    });
  }
  if (Object.keys(update).length === 0) {
    throw new LegacyAdminError(400, 'No fields to update.', {
      code: 'NO_FIELDS',
    });
  }

  const { row: updated, error } = await repo.updateTenantDetail(
    ctx.db,
    id,
    update
  );
  if (error || !updated) {
    if ((error as { code?: string } | null)?.code === '23505') {
      throw new LegacyAdminError(
        409,
        'Ce domaine personnalisé est déjà utilisé par un autre tenant.',
        { code: 'CUSTOM_DOMAIN_TAKEN' }
      );
    }
    ctx.logger.error('[admin/tenants/[id]] update error', error);
    throw serverError('Failed to update the tenant.');
  }
  if (
    'custom_domain' in update ||
    'custom_domain_state' in update ||
    'is_active' in update
  ) {
    invalidateTenantHostCache();
  }
  if (
    'network_share_scrims' in update ||
    'network_share_recruitment' in update ||
    'is_active' in update
  ) {
    resetNetworkSharingCache();
  }
  return {
    result: { tenant: updated },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      payload: { fields: Object.keys(update) },
    },
  } satisfies Audited<unknown>;
}

/** DELETE /api/admin/tenants/[id] — soft (`is_active = false`), owner-only. */
export async function deactivateTenant(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = detailId(rawId);
  assertOwner(scope);
  await assertTenantInScope(scope, id);
  const { row: existing, error } = await repo.getTenantDetail(ctx.db, id);
  if (error || !existing) throw new LegacyAdminError(404, 'Tenant not found.');
  if (PROTECTED_TENANT_SLUGS.has(existing.slug)) {
    throw new LegacyAdminError(403, 'This tenant cannot be deleted.', {
      code: 'TENANT_PROTECTED',
    });
  }
  const { row: updated, error: updErr } = await repo.updateTenantDetail(
    ctx.db,
    id,
    { is_active: false }
  );
  if (updErr || !updated) {
    ctx.logger.error('[admin/tenants/[id]] soft-delete error', updErr);
    throw serverError('Failed to deactivate the tenant.');
  }
  return {
    result: { tenant: updated },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      payload: { slug: existing.slug, name: existing.name },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------- cycle de vie ----------------------------- */

const lifecycleSchema = z.object({
  // `purged` est posé par le cron de purge, jamais demandé ici.
  state: z.enum(
    LIFECYCLE_STATES.filter((s) => s !== 'purged') as unknown as [
      LifecycleState,
      ...LifecycleState[],
    ]
  ),
  reason: z.string().trim().max(500).optional(),
  purgeAfterDays: z.number().int().min(1).max(365).optional(),
});
const REASON_MIN = 10;

function tenantIdOf(raw: unknown): string {
  return requireUuid(raw, 'Invalid tenant id.', 'INVALID_TENANT_ID');
}

/** POST /api/admin/tenants/[id]/lifecycle — owner (effectif). */
export async function changeLifecycle(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  assertOwner(scope);
  const id = tenantIdOf(rawId);
  await assertTenantInScope(scope, id);
  const parsed = lifecycleSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body', {
      code: 'INVALID_BODY',
      extra: { details: parsed.error.flatten() },
    });
  }
  const { state, purgeAfterDays } = parsed.data;
  const reason = parsed.data.reason ?? '';
  if (state !== 'active' && reason.length < REASON_MIN) {
    throw new LegacyAdminError(
      400,
      `Un motif d'au moins ${REASON_MIN} caractères est requis : il sera lu par le client et par le prochain qui ouvrira ce journal.`,
      { code: 'REASON_REQUIRED' }
    );
  }
  const { row, error } = await repo.getTenantLifecycleRow(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenant-lifecycle] load error', error);
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  if (state !== 'active' && PROTECTED_TENANT_SLUGS.has(row.slug)) {
    throw new LegacyAdminError(
      409,
      `L'espace « ${row.slug} » ne peut pas être fermé : c'est la plateforme elle-même.`,
      { code: 'PROTECTED_TENANT' }
    );
  }
  const now = new Date();
  const purgeAfter =
    state === 'purge_scheduled'
      ? new Date(now.getTime() + (purgeAfterDays ?? 30) * DAY_MS).toISOString()
      : null;
  const { row: updated, error: updErr } = await repo.updateTenantLifecycle(
    ctx.db,
    id,
    {
      lifecycle_state: state,
      lifecycle_reason: state === 'active' ? null : reason,
      lifecycle_changed_at: now.toISOString(),
      lifecycle_changed_by: scope.staffId,
      purge_after: purgeAfter,
    }
  );
  if (updErr) {
    ctx.logger.error('[admin/tenant-lifecycle] update error', updErr);
    throw serverError('Failed to change state.');
  }
  // État (60 s) et routage par domaine : un espace suspendu cesse MAINTENANT.
  invalidateLifecycleCache(id);
  invalidateTenantHostCache();
  return {
    result: { tenant: updated },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'tenant_lifecycle',
        from: row.lifecycle_state,
        to: state,
        reason: reason || null,
        purgeAfter,
      },
    },
  } satisfies Audited<unknown>;
}

/* ------------------------------- export -------------------------------- */

/** Plafond par table ; au-delà, on le DIT (`truncated`). */
const MAX_ROWS_PER_TABLE = 5_000;

/**
 * POST /api/admin/tenants/[id]/export — toutes les données d'un espace
 * (manifeste `EXPORTABLE_TABLES`, secrets et caches exclus par construction).
 */
export async function exportTenant(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  assertOwner(scope);
  const id = tenantIdOf(rawId);
  await assertTenantInScope(scope, id);
  const tenant = await repo.getTenantForExport(ctx.db, id);
  if (!tenant) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  const data: Record<string, unknown[]> = {};
  const truncated: string[] = [];
  const failed: string[] = [];
  for (const table of EXPORTABLE_TABLES as readonly unknown[]) {
    const name =
      typeof table === 'string' ? table : (table as { table: string }).table;
    const { rows, error } = await repo.exportTableRows(
      ctx.db,
      name,
      id,
      MAX_ROWS_PER_TABLE
    );
    if (error) {
      ctx.logger.error('[admin/tenant-export] table failed', {
        table: name,
        error: error.message,
      });
      failed.push(name);
      continue;
    }
    if (rows.length > 0) data[name] = rows;
    if (rows.length === MAX_ROWS_PER_TABLE) truncated.push(name);
  }
  return {
    result: {
      slug: tenant.slug,
      body: {
        exportedAt: new Date().toISOString(),
        tenant,
        report: {
          tables: Object.keys(data).length,
          rows: Object.values(data).reduce((n, rows) => n + rows.length, 0),
          truncated,
          failed,
          excluded:
            'Secrets et caches techniques (clés, jetons, idempotence) exclus par construction.',
        },
        data,
      },
    },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'export_tenant',
        tables: Object.keys(data).length,
        truncated: truncated.length,
        failed: failed.length,
      },
    },
  } satisfies Audited<unknown>;
}

/* ------------------------ Discord : invitation, serveur ---------------- */

/** GET /api/admin/tenants/[id]/bot-invite — lien signé pour CET espace. */
export async function getBotInvite(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  rawGuildId: unknown
) {
  const id = tenantIdOf(rawId);
  await assertTenantInScope(scope, id);
  const guildRaw = typeof rawGuildId === 'string' ? rawGuildId.trim() : '';
  const guildId = GUILD_ID_RE.test(guildRaw) ? guildRaw : null;
  const { row: tenant, error } = await repo.getTenantIdentity(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenant-bot-invite] tenant load error', error);
    throw serverError();
  }
  if (!tenant) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  const invite = buildTenantBotInvite({
    tenantId: id,
    staffId: scope.staffId,
    guildId,
  });
  return { tenant, url: invite.url, mode: invite.mode, guildId };
}

/**
 * POST /api/admin/tenants/[id]/guilds — rattache un serveur (règles dans
 * `attachGuildToTenant`). Déjà rattaché ici → 200 sans journal.
 */
export async function attachGuild(
  _ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const id = tenantIdOf(rawId);
  await assertTenantInScope(scope, id);
  const b = (body ?? {}) as Record<string, unknown>;
  const guildId = typeof b.guild_id === 'string' ? b.guild_id : '';
  const result = await attachGuildToTenant(id, guildId);
  if (!result.ok) {
    throw new LegacyAdminError(result.httpStatus, result.error, {
      code: result.code,
      extra: result.otherTenantSlug
        ? { tenant_slug: result.otherTenantSlug }
        : undefined,
    });
  }
  const payload = {
    guild_id: result.guildId,
    tenant: result.tenant,
    is_primary: result.isPrimary,
  };
  if (result.status === 'already_linked') {
    return {
      status: 200,
      result: { status: 'already_linked' as const, ...payload },
      audit: { skip: true },
    };
  }
  return {
    status: 201,
    result: { status: 'linked' as const, ...payload },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      payload: {
        guildId: result.guildId,
        tenantSlug: result.tenant.slug,
        tenantName: result.tenant.name,
        isPrimary: result.isPrimary,
        from: 'tenant_readiness',
      },
    },
  };
}

/* ----------------------------- supervision ----------------------------- */

export type TenantUsageRow = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  effectivePlan: TenantPlan;
  /** `null` = illimité. */
  monthLimit: number | null;
  monthUsed: number;
  percent: number | null;
  lastCallAt: string | null;
};

/** GET /api/admin/tenants/usage — consommation d'API du mois, tous espaces. */
export async function tenantsUsage(ctx: ServiceContext, rawWindow: unknown) {
  const window = typeof rawWindow === 'string' ? rawWindow : 'month';
  if (window !== 'month') {
    throw new LegacyAdminError(400, 'Only the month window is exposed.', {
      code: 'INVALID_WINDOW',
    });
  }
  const { rows: tenants, error } = await repo.listTenantsForUsage(ctx.db);
  if (error) {
    ctx.logger.error('[admin/tenants-usage] tenants load error', error);
    throw serverError('Failed to load tenants.');
  }
  const ids = tenants.map((t) => t.id);
  const key = monthKey(new Date());
  const counters = new Map<string, { count: number; updated: string | null }>();
  if (ids.length > 0) {
    const { rows, error: cErr } = await repo.listUsageCounters(
      ctx.db,
      key,
      ids
    );
    // Compteurs manquants = zéro : la vue ne tombe pas pour une table.
    if (cErr)
      ctx.logger.error('[admin/tenants-usage] counters load error', cErr);
    for (const row of rows) {
      counters.set(row.tenant_id, {
        count: row.count ?? 0,
        updated: row.updated_at,
      });
    }
  }
  const nowMs = Date.now();
  const rows: TenantUsageRow[] = tenants.map((t) => {
    const planState = {
      plan: (t.plan ?? 'discovery') as TenantPlan,
      plan_status: (t.plan_status ?? 'active') as PlanStatus,
      plan_expires_at: t.plan_expires_at ?? null,
    };
    const eff = effectivePlan(planState, nowMs);
    const quota = getPlanFeatures(eff).apiMonthlyQuota;
    const used = counters.get(t.id)?.count ?? 0;
    const limited = Number.isFinite(quota) && quota > 0;
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: planState.plan,
      effectivePlan: eff,
      monthLimit: Number.isFinite(quota) ? quota : null,
      monthUsed: used,
      percent: limited ? Math.round((used / quota) * 100) : null,
      lastCallAt: counters.get(t.id)?.updated ?? null,
    };
  });
  // Les plus proches du mur d'abord.
  rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
  return { window: 'month' as const, windowKey: key, rows };
}

export type TenantReadiness = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  effectivePlan: string;
  planStatus: string;
  planExpiresAt: string | null;
  isTrial: boolean;
  daysRemaining: number | null;
  guildCount: number;
  guilds: Array<{
    guildId: string;
    guildName: string | null;
    isPrimary: boolean;
    configuredKeys: number;
  }>;
  configuredKeys: number;
  ownerCount: number;
  staffCount: number;
  hasBotSecrets: boolean;
  hasEmailSender: boolean;
  apiTokenCount: number;
  apiTokenSoonestExpiry: string | null;
  botEnabled: boolean;
  blockers: string[];
};

function countBy(rows: Array<{ tenant_id?: string | null }>) {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.tenant_id) continue;
    out.set(r.tenant_id, (out.get(r.tenant_id) ?? 0) + 1);
  }
  return out;
}

/**
 * GET /api/admin/tenants/readiness — ce qui manque à chaque espace pour
 * tourner (règles partagées : utils/tenants/readinessRules.ts). Les espaces
 * `developer` sont exclus. Aucun secret lu : seulement la PRÉSENCE d'une ligne.
 */
export async function tenantsReadiness(ctx: ServiceContext) {
  const { rows: all, error } = await repo.listTenantsForReadiness(ctx.db);
  if (error) {
    ctx.logger.error('[admin/tenants/readiness] tenants load error', error);
    throw serverError('Failed to load tenants.');
  }
  const rows = all.filter((t) => (t.kind ?? 'organizer') !== 'developer');
  const ids = rows.map((t) => t.id);
  if (ids.length === 0)
    return { tenants: [], botInviteUrl: buildBotInviteUrl() };

  const [guildsRes, configRes, staffRes, secretsRes, emailRes, tokensRes] =
    await repo.readinessAggregates(
      ctx.db,
      ids,
      ['guild_id', 'extras', ...CONFIG_KEYS].join(', ')
    );
  for (const [label, r] of [
    ['discord_guilds', guildsRes],
    ['tenant_discord_config', configRes],
    ['tenant_staff', staffRes],
    ['tenant_secrets', secretsRes],
    ['integration_secrets', emailRes],
    ['tenant_api_tokens', tokensRes],
  ] as const) {
    if (r.error) {
      ctx.logger.error(
        `[admin/tenants/readiness] ${label} load error`,
        r.error
      );
    }
  }

  const guildRows = guildsRes.data ?? [];
  const guildCount = countBy(guildRows);
  const guildToTenant = new Map(
    guildRows.map((g) => [g.guild_id, g.tenant_id])
  );
  const configuredKeys = new Map<string, number>();
  const keysByGuild = new Map<string, number>();
  const nameByGuild = new Map<string, string>();
  for (const row of (configRes.data ?? []) as unknown as Array<
    Record<string, unknown>
  >) {
    const guildId = String(row.guild_id);
    const filled = countConfiguredKeys(row);
    keysByGuild.set(guildId, filled);
    const name = (row.extras as { guild_name?: unknown } | null)?.guild_name;
    if (typeof name === 'string' && name.trim()) {
      nameByGuild.set(guildId, name.trim());
    }
    const tenantId = guildToTenant.get(guildId);
    if (!tenantId) continue;
    configuredKeys.set(tenantId, (configuredKeys.get(tenantId) ?? 0) + filled);
  }
  const guildsByTenant = new Map<string, TenantReadiness['guilds']>();
  for (const g of guildRows) {
    const list = guildsByTenant.get(g.tenant_id) ?? [];
    list.push({
      guildId: g.guild_id,
      guildName: nameByGuild.get(g.guild_id) ?? null,
      isPrimary: g.is_primary !== false,
      configuredKeys: keysByGuild.get(g.guild_id) ?? 0,
    });
    guildsByTenant.set(g.tenant_id, list);
  }
  for (const list of guildsByTenant.values()) {
    list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }
  const staffRows = staffRes.data ?? [];
  const staffCount = countBy(staffRows);
  const ownerCount = countBy(staffRows.filter((r) => r.role === 'owner'));
  const withSecrets = new Set((secretsRes.data ?? []).map((r) => r.tenant_id));
  const withEmail = new Set((emailRes.data ?? []).map((r) => r.tenant_id));

  // Une clé échue ne vaut pas mieux qu'une clé absente.
  const tokenCount = new Map<string, number>();
  const tokenSoonest = new Map<string, string>();
  for (const row of tokensRes.data ?? []) {
    const exp = row.expires_at;
    if (exp && Date.parse(exp) <= Date.now()) continue;
    tokenCount.set(row.tenant_id, (tokenCount.get(row.tenant_id) ?? 0) + 1);
    if (!exp) continue;
    const current = tokenSoonest.get(row.tenant_id);
    if (!current || Date.parse(exp) < Date.parse(current)) {
      tokenSoonest.set(row.tenant_id, exp);
    }
  }

  const nowMs = Date.now();
  const tenants: TenantReadiness[] = rows.map((t) => {
    const planState = {
      plan: (t.plan ?? 'discovery') as TenantPlan,
      plan_status: (t.plan_status ?? 'active') as PlanStatus,
      plan_expires_at: t.plan_expires_at ?? null,
    };
    const eff = effectivePlan(planState, nowMs);
    const guilds = guildCount.get(t.id) ?? 0;
    const keys = configuredKeys.get(t.id) ?? 0;
    const staff = staffCount.get(t.id) ?? 0;
    const hasEmailSender = withEmail.has(t.id);
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      isActive: t.is_active,
      createdAt: t.created_at,
      plan: planState.plan,
      effectivePlan: eff,
      planStatus: planState.plan_status,
      planExpiresAt: t.plan_expires_at ?? null,
      isTrial: t.plan_is_trial === true,
      daysRemaining: t.plan_expires_at
        ? Math.ceil((Date.parse(t.plan_expires_at) - nowMs) / DAY_MS)
        : null,
      guildCount: guilds,
      guilds: guildsByTenant.get(t.id) ?? [],
      configuredKeys: keys,
      ownerCount: ownerCount.get(t.id) ?? 0,
      staffCount: staff,
      hasBotSecrets: withSecrets.has(t.id),
      hasEmailSender,
      apiTokenCount: tokenCount.get(t.id) ?? 0,
      apiTokenSoonestExpiry: tokenSoonest.get(t.id) ?? null,
      botEnabled: getPlanFeatures(eff).discordBot,
      blockers: computeBlockers({
        isActive: t.is_active !== false,
        guildCount: guilds,
        staffCount: staff,
        configuredKeys: keys,
        hasBotSecrets: withSecrets.has(t.id),
        hasEmailSender,
      }),
    };
  });
  return { tenants, botInviteUrl: buildBotInviteUrl() };
}

/** `null` = la lecture a échoué ; `0` = il n'y a rien. */
export type TenantOverview = {
  lifeSigns: Record<LifeSignKey, string | null>;
  volumes: Record<TenantDomainKey, number | null>;
  plan: {
    plan: TenantPlan;
    effectivePlan: TenantPlan;
    status: PlanStatus;
    expiresAt: string | null;
    isTrial: boolean;
    daysRemaining: number | null;
    botEnabled: boolean;
  };
  readiness: {
    blockers: string[];
    guildCount: number;
    staffCount: number;
    configuredKeys: number;
    hasEmailSender: boolean;
  };
  limits: Array<{ key: string; used: number; max: number | null }>;
  createdAt: string;
  cgv: { version: string | null; acceptedAt: string | null; current: boolean };
};

/** GET /api/admin/tenants/[id]/overview — même accès que la fiche. */
export async function tenantOverview(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
): Promise<TenantOverview> {
  const id = tenantIdOf(rawId);
  await assertTenantInScope(scope, id);
  const { row: t, error } = await repo.getTenantForOverview(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenant-overview] tenant load error', error);
    throw serverError();
  }
  if (!t) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  const planState = {
    plan: (t.plan ?? 'discovery') as TenantPlan,
    plan_status: (t.plan_status ?? 'active') as PlanStatus,
    plan_expires_at: t.plan_expires_at ?? null,
  };
  const nowMs = Date.now();
  const eff = effectivePlan(planState, nowMs);

  const countDomain = async (d: (typeof TENANT_DOMAINS)[number]) => {
    const { count, error: e } = await repo.countTenantRows(
      ctx.db,
      d.table,
      id,
      (d as { where?: Record<string, unknown> }).where ?? {},
      (d as { softDeleteCol?: string }).softDeleteCol
    );
    if (e) {
      ctx.logger.error(`[admin/tenant-overview] count ${d.table} error`, e);
      return null;
    }
    return count ?? 0;
  };
  const latest = async (s: (typeof LIFE_SIGNS)[number]) => {
    const { rows, error: e } = await repo.latestTenantDate(
      ctx.db,
      s.table,
      s.dateCol,
      id
    );
    if (e) {
      ctx.logger.error(`[admin/tenant-overview] latest ${s.table} error`, e);
      return null;
    }
    const value = rows[0]?.[s.dateCol];
    return typeof value === 'string' ? value : null;
  };

  const [volumeValues, signValues, aggregates] = await Promise.all([
    Promise.all(TENANT_DOMAINS.map(countDomain)),
    Promise.all(LIFE_SIGNS.map(latest)),
    repo.overviewAggregates(ctx.db, id),
  ]);
  const [guildsRes, staffRes, emailRes, secretsRes] = aggregates;
  const guildIds = (guildsRes.data ?? []).map((g) => g.guild_id);

  let configuredKeys = 0;
  if (guildIds.length > 0) {
    const { rows, error: cErr } = await repo.listDiscordConfigColumns(
      ctx.db,
      ['guild_id', ...CONFIG_KEYS].join(', '),
      guildIds
    );
    if (cErr)
      ctx.logger.error('[admin/tenant-overview] discord config error', cErr);
    for (const row of rows) configuredKeys += countConfiguredKeys(row);
  }
  const staffCount = staffRes.count ?? 0;
  const hasEmailSender = Boolean(emailRes.data);
  const leagues = await assertPlanLimit(id, 'leagues');

  return {
    lifeSigns: Object.fromEntries(
      LIFE_SIGNS.map((s, i) => [s.key, signValues[i]])
    ) as Record<LifeSignKey, string | null>,
    volumes: Object.fromEntries(
      TENANT_DOMAINS.map((d, i) => [d.key, volumeValues[i]])
    ) as Record<TenantDomainKey, number | null>,
    plan: {
      plan: planState.plan,
      effectivePlan: eff,
      status: planState.plan_status,
      expiresAt: planState.plan_expires_at,
      isTrial: t.plan_is_trial === true,
      daysRemaining: planState.plan_expires_at
        ? Math.ceil((Date.parse(planState.plan_expires_at) - nowMs) / DAY_MS)
        : null,
      botEnabled: getPlanFeatures(eff).discordBot,
    },
    readiness: {
      blockers: computeBlockers({
        isActive: t.is_active !== false,
        guildCount: guildIds.length,
        staffCount,
        configuredKeys,
        hasBotSecrets: Boolean(secretsRes.data),
        hasEmailSender,
      }),
      guildCount: guildIds.length,
      staffCount,
      configuredKeys,
      hasEmailSender,
    },
    limits: [
      {
        key: 'leagues',
        used: leagues.used,
        max: Number.isFinite(leagues.max) ? leagues.max : null,
      },
    ],
    createdAt: t.created_at,
    cgv: {
      version: t.cgv_version,
      acceptedAt: t.cgv_accepted_at,
      current: t.cgv_version === CGV_VERSION,
    },
  };
}
