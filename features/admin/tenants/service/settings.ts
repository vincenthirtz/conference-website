// features/admin/tenants/service/settings.ts — facturation (état, lien de
// paiement, RNA), domaine propre, configuration Discord par serveur.

import crypto from 'node:crypto';
import { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import type { Database } from '@/types/database.generated';
import { canAccessTenant } from '@/utils/adminTenants';
import { hasAtLeastRole } from '@/utils/staffRoles';
import { formatZodError } from '@/utils/validation';
import { CGV_VERSION } from '@/utils/billing/cgv';
import { createCheckoutIntent } from '@/utils/helloasso';
import {
  PLAN_GRACE_DAYS,
  PLAN_LABELS,
  PLAN_PRICES_EUR,
  effectivePlan,
  getPlanFeatures,
  isInPlanGrace,
  isPurchasablePlan,
  planPrice,
  type PlanStatus,
  type PlanTerm,
  type TenantPlan,
} from '@/utils/billing/planFeatures';
import { buildPlanCheckoutMetadata } from '@/utils/billing/tenantPlanBilling';
import { nonprofitDiscoveryIsFree } from '@/utils/billing/nonprofitGrant';
import {
  lookupRna,
  parseRna,
  rnaVerdict,
  type RnaPendingReason,
} from '@/utils/billing/rna';
import { invalidateTenantHostCache } from '@/utils/tenant';
import {
  checkDomain,
  dnsInstructions,
} from '@/utils/tenants/domainVerification';
import { parsePlacementRules } from '@/utils/discord/placementRoles';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/tenants';
import {
  type StaffScope,
  assertActiveTenant,
  assertAdminOfTenant,
  assertAdminOrTenantMember,
  requireUuid,
  serverError,
} from './scope';

type TenantUpdate = Database['public']['Tables']['tenants']['Update'];
const DAY_MS = 86_400_000;

const tenantIdOf = (raw: unknown) =>
  requireUuid(raw, 'Invalid tenant id.', 'INVALID_TENANT_ID');

/* ----------------------------- facturation ----------------------------- */

/** GET /api/admin/tenants/[id]/billing — espace actif (ou pôle-admin). */
export async function getBilling(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = tenantIdOf(rawId);
  assertActiveTenant(scope, id);
  const { row: t, error } = await repo.getTenantBilling(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenants/billing] tenant lookup error', error);
    throw serverError();
  }
  if (!t) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  const plan = t.plan as TenantPlan;
  const planStatus = t.plan_status as PlanStatus;
  const planExpiresAt = t.plan_expires_at ?? null;
  const planTerm: PlanTerm = t.plan_term === 'month' ? 'month' : 'year';
  const nowMs = Date.now();
  const planState = {
    plan,
    plan_status: planStatus,
    plan_expires_at: planExpiresAt,
  };
  const eff = effectivePlan(planState, nowMs);

  // Paiements : best-effort, une erreur rend une liste vide.
  const { rows: pays, error: payErr } = await repo.listPlanPayments(ctx.db, id);
  if (payErr) {
    ctx.logger.error('[admin/tenants/billing] payments lookup error', payErr);
  }
  const inGrace = isInPlanGrace(planState, nowMs);
  return {
    plan,
    planLabel: PLAN_LABELS[plan] ?? plan,
    planStatus,
    planStartedAt: t.plan_started_at ?? null,
    planExpiresAt,
    daysRemaining:
      planExpiresAt !== null
        ? Math.max(0, Math.ceil((Date.parse(planExpiresAt) - nowMs) / DAY_MS))
        : null,
    isTrial: t.plan_is_trial === true,
    effectivePlan: eff,
    planTerm,
    inGrace,
    graceEndsAt:
      planExpiresAt && inGrace
        ? new Date(
            Date.parse(planExpiresAt) + PLAN_GRACE_DAYS * DAY_MS
          ).toISOString()
        : null,
    nonprofitFree: nonprofitDiscoveryIsFree({
      plan,
      nonprofit_verified_at: t.nonprofit_verified_at ?? null,
    }),
    nonprofitOrgName: t.nonprofit_org_name ?? null,
    nonprofitRna: t.nonprofit_rna ?? null,
    nonprofitVerifiedVia: t.nonprofit_verified_via ?? null,
    capabilities: getPlanFeatures(eff),
    // Catalogue DÉDUIT du barème (jamais une liste en dur).
    catalog: (Object.keys(PLAN_PRICES_EUR) as TenantPlan[])
      .filter((p) => isPurchasablePlan(p))
      .map((p) => ({
        plan: p,
        label: PLAN_LABELS[p],
        priceEur: PLAN_PRICES_EUR[p] as number,
        monthlyPriceEur: planPrice(p, 'month') as number,
      })),
    payments: pays.map((p) => ({
      id: p.id,
      plan: p.plan,
      amountCents: p.amount,
      paidAt: p.applied_at,
      helloassoPaymentId: p.helloasso_payment_id,
    })),
  };
}

const checkoutSchema = z.object({
  plan: z
    .string()
    .refine(isPurchasablePlan, 'plan doit être un plan au barème catalogue.'),
  term: z.enum(['month', 'year']).optional(),
  // Double consentement (CGV + renonciation au droit de rétractation).
  cgvVersion: z.string().min(1),
  cgvAccepted: z.literal(true),
  immediateExecutionWaiver: z.literal(true),
});

/**
 * POST /api/admin/tenants/[id]/plan-checkout — lien HelloAsso ciblé. Un owner
 * GLOBAL agit sur tout espace ; les autres, uniquement chez eux (T10).
 * L'acceptation des CGV s'écrit AVANT le lien, de façon bloquante.
 */
export async function createPlanCheckout(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown,
  origin: string
) {
  const id = tenantIdOf(rawId);
  if (!hasAtLeastRole(scope.globalRole, 'owner')) {
    if (
      !(await canAccessTenant(scope.staffId, id, {
        isPoleAdmin: scope.isPoleAdmin,
      }))
    ) {
      throw new LegacyAdminError(
        403,
        'Cet espace ne fait pas partie de votre périmètre.',
        { code: 'TENANT_OUT_OF_SCOPE' }
      );
    }
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    throw new LegacyAdminError(400, formatZodError(parsed.error), {
      code: 'INVALID_BODY',
    });
  }
  const { plan, cgvVersion } = parsed.data;
  const term = parsed.data.term ?? 'year';
  if (cgvVersion !== CGV_VERSION) {
    throw new LegacyAdminError(
      409,
      'Les conditions générales de vente ont changé. Rechargez la page et relisez-les avant de commander.',
      { code: 'CGV_VERSION_STALE', extra: { currentVersion: CGV_VERSION } }
    );
  }
  const priceEur = planPrice(plan, term);
  if (typeof priceEur !== 'number' || priceEur <= 0) {
    throw new LegacyAdminError(400, "Ce plan n'a pas de tarif catalogue.", {
      code: 'NO_PRICE',
    });
  }
  const { row: tenant, error } = await repo.getTenantForCheckout(ctx.db, id);
  if (error) {
    ctx.logger.error(
      '[admin/tenants/plan-checkout] tenant lookup error',
      error
    );
    throw serverError();
  }
  if (!tenant) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  // L'association n'est jamais facturée.
  if (tenant.plan === 'foundation') {
    throw new LegacyAdminError(
      400,
      "Ce compte (Association) n'est pas soumis à la facturation.",
      { code: 'NOT_BILLABLE' }
    );
  }
  const amountCents = priceEur * 100;
  const { row: acceptance, error: accErr } = await repo.insertCgvAcceptance(
    ctx.db,
    {
      tenant_id: id,
      staff_id: scope.staffId,
      cgv_version: CGV_VERSION,
      plan,
      term,
      amount_cents: amountCents,
      cgv_accepted: true,
      immediate_execution_waiver: true,
    }
  );
  if (accErr || !acceptance) {
    ctx.logger.error(
      '[admin/tenants/plan-checkout] cgv acceptance insert',
      accErr
    );
    throw new LegacyAdminError(
      500,
      "Impossible d'enregistrer votre acceptation des conditions de vente. Aucune commande n'a été passée.",
      { code: 'CGV_NOT_RECORDED' }
    );
  }
  let checkout: { id: number; redirectUrl: string };
  try {
    checkout = await createCheckoutIntent({
      totalAmount: amountCents,
      returnUrl: `${origin}/don?status=success`,
      errorUrl: `${origin}/don?status=error`,
      itemName: `Régie solidaire — plan ${PLAN_LABELS[plan as TenantPlan]} (${
        term === 'month' ? '1 mois' : '1 an'
      })`,
      metadata: buildPlanCheckoutMetadata(id, plan, term),
    });
  } catch (err) {
    ctx.logger.error(
      '[admin/tenants/plan-checkout] checkout create error',
      err
    );
    throw new LegacyAdminError(
      502,
      'Impossible de créer le lien de paiement. Réessayez plus tard.'
    );
  }
  const { error: linkErr } = await repo.linkCgvAcceptance(
    ctx.db,
    acceptance.id,
    checkout.id
  );
  if (linkErr) {
    ctx.logger.warn(
      '[admin/tenants/plan-checkout] cgv acceptance link failed',
      linkErr
    );
  }
  // Mapping de secours (la metadata HelloAsso reste le canal primaire).
  const { error: mapErr } = await repo.insertPlanCheckout(ctx.db, {
    checkout_intent_id: checkout.id,
    tenant_id: id,
    plan,
    amount_expected: amountCents,
    term,
    created_by: scope.staffId,
  });
  if (mapErr) {
    ctx.logger.warn(
      '[admin/tenants/plan-checkout] checkout mapping insert failed',
      mapErr
    );
  }
  return {
    result: {
      redirectUrl: checkout.redirectUrl,
      checkoutIntentId: checkout.id,
      plan,
      amountEur: priceEur,
      term,
    },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'generate_plan_checkout',
        plan,
        amount_eur: priceEur,
        term,
        checkout_intent_id: checkout.id,
        tenant_slug: tenant.slug,
      },
    },
  } satisfies Audited<unknown>;
}

export type NonprofitRnaResponse =
  | {
      rna: string;
      verified: boolean;
      orgName: string | null;
      pendingReason?: RnaPendingReason;
    }
  | { removed: true };

function rnaTenant(scope: StaffScope, rawId: unknown): string {
  const id = tenantIdOf(rawId);
  assertActiveTenant(scope, id);
  return id;
}

/**
 * PUT /api/admin/tenants/[id]/nonprofit-rna — association en activité →
 * Découverte offerte ; non-association → 422 ; silence de l'annuaire →
 * déclaration enregistrée sans estampille.
 */
export async function declareRna(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
): Promise<Audited<NonprofitRnaResponse>> {
  const tenantId = rnaTenant(scope, rawId);
  const rna = parseRna((body as { rna?: unknown } | undefined)?.rna);
  if (!rna) {
    throw new LegacyAdminError(
      400,
      'Numéro RNA attendu au format W suivi de 9 caractères.',
      { code: 'RNA_INVALID' }
    );
  }
  // Un même numéro n'ouvre pas la gratuité à deux espaces.
  if (await repo.findTenantByRna(ctx.db, rna, tenantId)) {
    throw new LegacyAdminError(
      409,
      'Ce numéro RNA est déjà rattaché à un autre espace.',
      { code: 'RNA_ALREADY_USED' }
    );
  }
  const verdict = rnaVerdict(await lookupRna(rna));
  if (verdict.decision === 'reject') {
    throw new LegacyAdminError(
      422,
      "Ce numéro désigne une structure qui n'est pas une association dans l'Annuaire des Entreprises.",
      { code: 'RNA_NOT_ASSOCIATION' }
    );
  }
  const verified = verdict.decision === 'verify';
  const now = new Date().toISOString();
  const patch: TenantUpdate = {
    nonprofit_rna: rna,
    nonprofit_rna_declared_at: now,
  };
  if (verified) {
    patch.nonprofit_verified_at = now;
    patch.nonprofit_verified_via = 'rna';
    patch.nonprofit_org_name = verdict.orgName;
  }
  const { error } = await repo.updateTenant(ctx.db, tenantId, patch);
  if (error) {
    ctx.logger.error('[admin/nonprofit-rna] update: %s', error.message);
    throw new LegacyAdminError(500, 'Server error.', { code: 'SERVER_ERROR' });
  }
  return {
    result: {
      rna,
      verified,
      orgName: verified ? verdict.orgName : null,
      ...(verified ? {} : { pendingReason: verdict.reason }),
    },
    audit: {
      entity_type: 'tenant',
      entity_id: tenantId,
      tenant_id: tenantId,
      payload: {
        nonprofit_rna: rna,
        verified,
        via: verified ? 'rna' : null,
        pendingReason: verified ? null : verdict.reason,
      },
    },
  };
}

/** DELETE — retire le numéro, et la gratuité qu'IL portait seulement. */
export async function removeRna(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
): Promise<Audited<NonprofitRnaResponse>> {
  const tenantId = rnaTenant(scope, rawId);
  const current = await repo.getNonprofitVia(ctx.db, tenantId);
  const patch: TenantUpdate = {
    nonprofit_rna: null,
    nonprofit_rna_declared_at: null,
  };
  if (current?.nonprofit_verified_via === 'rna') {
    patch.nonprofit_verified_at = null;
    patch.nonprofit_verified_via = null;
    patch.nonprofit_org_name = null;
  }
  const { error } = await repo.updateTenant(ctx.db, tenantId, patch);
  if (error) {
    ctx.logger.error('[admin/nonprofit-rna] delete: %s', error.message);
    throw new LegacyAdminError(500, 'Server error.', { code: 'SERVER_ERROR' });
  }
  return {
    result: { removed: true },
    audit: {
      entity_type: 'tenant',
      entity_id: tenantId,
      tenant_id: tenantId,
      payload: {
        nonprofit_rna: null,
        grantCleared: 'nonprofit_verified_at' in patch,
      },
    },
  };
}

/* ---------------------------- domaine propre --------------------------- */

async function loadDomain(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = tenantIdOf(rawId);
  await assertAdminOrTenantMember(scope, id);
  const { row, error } = await repo.getTenantDomain(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenant-domain] load error', error);
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  return { id, row };
}

type DomainRow = Awaited<ReturnType<typeof repo.getTenantDomain>>['row'] & {};

/** Le jeton ne sort que DANS les enregistrements DNS à créer (c'est leur objet). */
function domainSummary(row: DomainRow) {
  return {
    domain: row.custom_domain,
    state: row.custom_domain_state,
    checkedAt: row.custom_domain_checked_at,
    error: row.custom_domain_error,
    records:
      row.custom_domain && row.custom_domain_token
        ? dnsInstructions(row.custom_domain, row.custom_domain_token)
        : [],
  };
}

/** GET /api/admin/tenants/[id]/domain */
export async function getDomain(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const { row } = await loadDomain(ctx, scope, rawId);
  return domainSummary(row);
}

/** POST /api/admin/tenants/[id]/domain — vérifie maintenant (TXT = preuve). */
export async function verifyDomain(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const { id, row } = await loadDomain(ctx, scope, rawId);
  if (!row.custom_domain || !row.custom_domain_token) {
    throw new LegacyAdminError(400, 'Aucun domaine à vérifier.', {
      code: 'NO_DOMAIN',
    });
  }
  const check = await checkDomain(row.custom_domain, row.custom_domain_token);
  const now = new Date().toISOString();
  const state = check.ok ? 'verified' : 'failed';
  const detail = check.ok && check.routingFound ? null : check.detail;
  const { error } = await repo.updateTenant(ctx.db, id, {
    custom_domain_state: state,
    custom_domain_checked_at: now,
    custom_domain_error: detail,
  });
  if (error) {
    ctx.logger.error('[admin/tenant-domain] update error', error);
    throw serverError('Failed to save verification.');
  }
  invalidateTenantHostCache();
  return {
    result: {
      ...domainSummary(row),
      state,
      checkedAt: now,
      error: detail,
      proofFound: check.proofFound,
      routingFound: check.routingFound,
    },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'verify_custom_domain',
        domain: row.custom_domain,
        state,
        routingFound: check.routingFound,
      },
    },
  } satisfies Audited<unknown>;
}

/* --------------------------- config Discord ---------------------------- */

const EMPTY_CONFIG = {
  staff_log_channel_id: null,
  matches_live_channel_id: null,
  disputes_forum_channel_id: null,
  news_ingest_channel_id: null,
  scrims_announce_channel_id: null,
  free_players_channel_id: null,
  team_openings_channel_id: null,
  captain_role_id: null,
  substitute_role_id: null,
  staff_role_owner_id: null,
  staff_role_admin_id: null,
  staff_role_caster_id: null,
  teams_voice_category_id: null,
  disputes_forum_tag_open_id: null,
  disputes_forum_tag_pending_id: null,
  disputes_forum_tag_resolved_id: null,
  welcome_enabled: false,
  welcome_channel_id: null,
  welcome_message: null,
  welcome_dm_message: null,
  member_leave_channel_id: null,
  extras: {} as Record<string, unknown>,
};

/** GET /api/admin/tenants/[id]/discord-config — admin+ ET rattaché ici. */
export async function listDiscordConfigs(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = requireUuid(rawId, 'Invalid tenant id.');
  await assertAdminOfTenant(scope, id);
  const { rows: guilds, error: gErr } = await repo.listTenantGuilds(ctx.db, id);
  if (gErr) {
    ctx.logger.error(
      '[admin/tenants/[id]/discord-config] list guilds error',
      gErr
    );
    throw serverError('Failed to load guilds.');
  }
  const guildIds = guilds.map((g) => g.guild_id);
  const byGuild = new Map<string, Record<string, unknown>>();
  if (guildIds.length > 0) {
    const { rows, error } = await repo.listDiscordConfigs(ctx.db, guildIds);
    if (error) {
      ctx.logger.error(
        '[admin/tenants/[id]/discord-config] list config error',
        error
      );
      throw serverError('Failed to load configs.');
    }
    for (const c of rows) byGuild.set(c.guild_id, c);
  }
  return {
    configs: guilds.map((g) => {
      const existing = byGuild.get(g.guild_id);
      return existing
        ? { ...existing, is_primary: g.is_primary }
        : { guild_id: g.guild_id, is_primary: g.is_primary, ...EMPTY_CONFIG };
    }),
  };
}

const SNOWFLAKE_RE = /^[0-9]{15,25}$/;
const NULLABLE_SNOWFLAKE_KEYS = [
  'staff_log_channel_id',
  'matches_live_channel_id',
  'disputes_forum_channel_id',
  'news_ingest_channel_id',
  'scrims_announce_channel_id',
  'free_players_channel_id',
  'team_openings_channel_id',
  'mvp_results_channel_id',
  'captain_role_id',
  'substitute_role_id',
  'staff_role_owner_id',
  'staff_role_admin_id',
  'staff_role_caster_id',
  'teams_voice_category_id',
  'disputes_forum_tag_open_id',
  'disputes_forum_tag_pending_id',
  'disputes_forum_tag_resolved_id',
  'welcome_channel_id',
  'member_leave_channel_id',
] as const;
const NULLABLE_TEXT_KEYS = ['welcome_message', 'welcome_dm_message'] as const;
const WELCOME_MESSAGE_MAX_LEN = 2000;

function invalid(message: string, code: string, field?: string) {
  return new LegacyAdminError(400, message, {
    code,
    extra: field ? { field } : undefined,
  });
}

/**
 * PUT /api/admin/tenants/[id]/discord-config/[guildId] — whitelist des
 * champs : un champ affiché par l'écran mais absent d'ici serait jeté EN
 * SILENCE (garder UI ↔ colonnes ↔ cette liste en phase).
 */
export async function saveDiscordConfig(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  rawGuildId: unknown,
  body: unknown
) {
  const id = requireUuid(rawId, 'Invalid tenant id.');
  if (typeof rawGuildId !== 'string' || !SNOWFLAKE_RE.test(rawGuildId)) {
    throw invalid('Invalid guildId.', 'INVALID_GUILD_ID');
  }
  const guildId = rawGuildId;
  await assertAdminOfTenant(scope, id);
  const { row: link, error: linkErr } = await repo.getGuildLink(
    ctx.db,
    guildId
  );
  if (linkErr) {
    ctx.logger.error(
      '[admin/tenants/[id]/discord-config/[guildId]] link lookup error',
      linkErr
    );
    throw serverError('Failed to verify guild link.');
  }
  if (!link || link.tenant_id !== id) {
    throw new LegacyAdminError(404, 'Guild not linked to this tenant.', {
      code: 'GUILD_NOT_IN_TENANT',
    });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const upsert: Record<string, unknown> = { guild_id: guildId };
  for (const key of NULLABLE_SNOWFLAKE_KEYS) {
    if (!(key in b)) continue;
    const v = b[key];
    const ok =
      v === null ||
      (typeof v === 'string' && (v === '' || SNOWFLAKE_RE.test(v)));
    if (!ok) {
      throw invalid(
        `${key} must be a snowflake (15-25 digits) or null.`,
        'INVALID_SNOWFLAKE',
        key
      );
    }
    upsert[key] = v === '' ? null : v;
  }
  if ('placement_roles' in b) {
    const raw = b.placement_roles;
    if (raw === null) upsert.placement_roles = null;
    else if (!Array.isArray(raw)) {
      throw invalid(
        'placement_roles must be an array or null.',
        'INVALID_PLACEMENT_ROLES',
        'placement_roles'
      );
    } else {
      const rules = parsePlacementRules(raw);
      if (raw.length > 0 && rules.length === 0) {
        throw invalid(
          'No valid placement rule in the payload.',
          'INVALID_PLACEMENT_ROLES',
          'placement_roles'
        );
      }
      upsert.placement_roles = rules;
    }
  }
  if ('welcome_enabled' in b) {
    if (typeof b.welcome_enabled !== 'boolean') {
      throw invalid(
        'welcome_enabled must be a boolean.',
        'INVALID_WELCOME_ENABLED',
        'welcome_enabled'
      );
    }
    upsert.welcome_enabled = b.welcome_enabled;
  }
  for (const key of NULLABLE_TEXT_KEYS) {
    if (!(key in b)) continue;
    const v = b[key];
    if (v !== null && typeof v !== 'string') {
      throw invalid(
        `${key} must be a string or null.`,
        'INVALID_WELCOME_MESSAGE',
        key
      );
    }
    const trimmed = typeof v === 'string' ? v.trim() : null;
    if (trimmed && trimmed.length > WELCOME_MESSAGE_MAX_LEN) {
      throw invalid(
        `${key} must be at most ${WELCOME_MESSAGE_MAX_LEN} characters.`,
        'INVALID_WELCOME_MESSAGE',
        key
      );
    }
    upsert[key] = trimmed && trimmed.length > 0 ? trimmed : null;
  }
  if ('extras' in b) {
    const e = b.extras;
    if (e !== null && (typeof e !== 'object' || Array.isArray(e))) {
      throw invalid('extras must be an object.', 'INVALID_EXTRAS');
    }
    upsert.extras = e ?? {};
  }

  const { error } = await repo.upsertDiscordConfig(
    ctx.db,
    upsert as Database['public']['Tables']['tenant_discord_config']['Insert']
  );
  if (error) {
    ctx.logger.error(
      '[admin/tenants/[id]/discord-config/[guildId]] upsert error',
      error
    );
    throw serverError('Failed to save config.');
  }
  const { row: config, error: readErr } = await repo.getDiscordConfig(
    ctx.db,
    guildId
  );
  if (readErr) {
    ctx.logger.error(
      '[admin/tenants/[id]/discord-config/[guildId]] read error',
      readErr
    );
    throw serverError('Failed to read config.');
  }
  return {
    result: { config: config ?? upsert },
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      payload: {
        guildId,
        fields: Object.keys(upsert).filter((k) => k !== 'guild_id'),
      },
    },
  } satisfies Audited<unknown>;
}

const BOT_TIMEOUT_MS = 12_000;

/**
 * GET /api/admin/tenants/[id]/discord-config/[guildId]/channels — inventaire
 * salons/rôles relayé au bot (GET signé HMAC avec le secret de l'espace, qui
 * ne sort jamais d'ici). Renvoie le corps du bot tel quel.
 */
export async function guildInventory(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  rawGuildId: unknown
) {
  const id = requireUuid(rawId, 'Invalid tenant id.');
  if (typeof rawGuildId !== 'string' || !SNOWFLAKE_RE.test(rawGuildId)) {
    throw new LegacyAdminError(400, 'Invalid guild id.');
  }
  const guildId = rawGuildId;
  await assertAdminOfTenant(scope, id);
  const { row, error } = await repo.getTenantGuild(ctx.db, id, guildId);
  if (error) {
    ctx.logger.error('[discord-config/channels] guild lookup error', error);
    throw serverError('Lookup failed.');
  }
  if (!row) throw new LegacyAdminError(404, 'Guild not linked to tenant.');

  const webhookUrl = process.env.BOT_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new LegacyAdminError(503, 'Bot webhook non configuré.');
  }
  const secret = await repo.getBotWebhookSecret(ctx.db, id);
  if (!secret) {
    throw new LegacyAdminError(
      503,
      'Secret webhook bot manquant pour ce tenant.'
    );
  }
  let inventoryUrl: URL;
  try {
    inventoryUrl = new URL('guild-inventory', webhookUrl);
  } catch {
    throw new LegacyAdminError(503, 'BOT_WEBHOOK_URL invalide.');
  }
  inventoryUrl.searchParams.set('guildId', guildId);
  const timestamp = new Date().toISOString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${guildId}:${timestamp}`)
    .digest('hex');

  let botRes: Response;
  try {
    botRes = await fetch(inventoryUrl.toString(), {
      method: 'GET',
      headers: {
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp,
      },
      signal: AbortSignal.timeout(BOT_TIMEOUT_MS),
    });
  } catch (err) {
    ctx.logger.error('[discord-config/channels] bot fetch failed', err);
    throw new LegacyAdminError(504, 'Bot injoignable.');
  }
  if (!botRes.ok) {
    ctx.logger.warn(
      `[discord-config/channels] bot responded ${botRes.status} for guild ${guildId}`
    );
    if (botRes.status === 404) {
      throw new LegacyAdminError(
        404,
        'Serveur introuvable côté bot (le bot est-il présent sur ce Discord ?).'
      );
    }
    throw new LegacyAdminError(502, 'Erreur inventaire côté bot.');
  }
  try {
    return (await botRes.json()) as unknown;
  } catch (err) {
    ctx.logger.error('[discord-config/channels] bot fetch failed', err);
    throw new LegacyAdminError(504, 'Bot injoignable.');
  }
}
