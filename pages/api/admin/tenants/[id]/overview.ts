// pages/api/admin/tenants/[id]/overview.ts
//
// GET : « il se passe quoi, dans cet espace ? »
//
// La fiche d'un espace montrait trois onglets — Général, Discord, Staff — qui
// disent tous ce qu'on peut CHANGER. Aucun ne disait ce qui se passe. Un espace
// créé il y a trois semaines et jamais utilisé était indiscernable d'un espace
// en pleine saison : mêmes champs, tous remplis.
//
// Cet endpoint répond en une requête agrégée, en trois blocs :
//
//   - `lifeSigns` : les quatre dernières fois. Le bot a-t-il parlé, a-t-on joué,
//     le staff est-il venu, l'API a-t-elle servi. C'est ce qui distingue un
//     espace vivant d'un espace en sommeil, et aucune des deux situations n'est
//     lisible dans un formulaire.
//   - `volumes`   : ce que l'espace contient, par domaine déclaré dans le
//     manifeste `utils/tenants/tenantScope.ts` — jamais une liste de tables
//     recopiée ici.
//   - `readiness` : ce qui manque, calculé par les MÊMES règles que le hub
//     d'onboarding (`utils/tenants/readinessRules.ts`). Deux définitions de
//     « opérationnel » auraient divergé au premier critère ajouté.
//
// Dégradation locale : une agrégation en erreur rend `null` pour SA ligne et
// n'empêche jamais la réponse. Un écran d'ensemble qui tombe entier parce qu'un
// compteur est indisponible ne sert personne — et c'est le compteur le moins
// important qui aurait le plus de chances de tout emporter.
//
// Portée : la même que la fiche qu'il alimente — admin+ globalement, ou staff
// rattaché à CET espace (cf. `canAccessTenant`). Rien ici n'est plus sensible
// que ce que la fiche montre déjà.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';
import {
  effectivePlan,
  getPlanFeatures,
  type PlanStatus,
  type TenantPlan,
} from '@/utils/billing/planFeatures';
import {
  computeBlockers,
  countConfiguredKeys,
  CONFIG_KEYS,
} from '@/utils/tenants/readinessRules';
import {
  TENANT_DOMAINS,
  LIFE_SIGNS,
  type TenantDomainKey,
  type LifeSignKey,
} from '@/utils/tenants/tenantScope';

const DAY_MS = 86_400_000;

/** `null` = la lecture a échoué ; `0` / absence = il n'y a rien. Ce n'est pas pareil. */
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
  createdAt: string;
};

/** Compte les lignes d'un domaine pour un espace. `null` si la lecture échoue. */
async function countDomain(
  domain: (typeof TENANT_DOMAINS)[number],
  tenantId: string
): Promise<number | null> {
  let q = supabaseAdmin
    .from(domain.table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  for (const [col, value] of Object.entries(
    (domain as { where?: Record<string, unknown> }).where ?? {}
  )) {
    q = q.eq(col, value as never);
  }
  const soft = (domain as { softDeleteCol?: string }).softDeleteCol;
  if (soft) q = q.is(soft, null);

  const { count, error } = await q;
  if (error) {
    logger.error(`[admin/tenant-overview] count ${domain.table} error`, error);
    return null;
  }
  return count ?? 0;
}

/** Date la plus récente d'un signe de vie. `null` = jamais, ou lecture en erreur. */
async function latestDate(
  sign: (typeof LIFE_SIGNS)[number],
  tenantId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from(sign.table)
    .select(sign.dateCol)
    .eq('tenant_id', tenantId)
    .not(sign.dateCol, 'is', null)
    .order(sign.dateCol, { ascending: false })
    .limit(1);

  if (error) {
    logger.error(`[admin/tenant-overview] latest ${sign.table} error`, error);
    return null;
  }
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  const value = row?.[sign.dateCol];
  return typeof value === 'string' ? value : null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-tenant-overview')
  ) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  // Même règle d'accès que la fiche qu'il alimente : admin+ globalement, ou
  // staff rattaché à CET espace, ou admin de pôle.
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    const isPoleAdmin =
      (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
    if (!(await canAccessTenant(ctx.staff.id, id, { isPoleAdmin }))) {
      return res.status(403).json({ error: 'No access to this tenant.' });
    }
  }

  const { data: tenant, error: tErr } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, created_at, is_active, plan, plan_status, plan_expires_at, plan_is_trial'
    )
    .eq('id', id)
    .maybeSingle();

  if (tErr) {
    logger.error('[admin/tenant-overview] tenant load error', tErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  const t = tenant as {
    created_at: string;
    is_active: boolean;
    plan: string | null;
    plan_status: string | null;
    plan_expires_at: string | null;
    plan_is_trial: boolean | null;
  };

  const planState = {
    plan: (t.plan ?? 'discovery') as TenantPlan,
    plan_status: (t.plan_status ?? 'active') as PlanStatus,
    plan_expires_at: t.plan_expires_at ?? null,
  };
  const nowMs = Date.now();
  const eff = effectivePlan(planState, nowMs);
  const botEnabled = getPlanFeatures(eff).discordBot;

  // Tout en parallèle : la vue est une photo, pas une séquence.
  const [volumeValues, signValues, guildsRes, staffRes, emailRes] =
    await Promise.all([
      Promise.all(TENANT_DOMAINS.map((d) => countDomain(d, id))),
      Promise.all(LIFE_SIGNS.map((s) => latestDate(s, id))),
      supabaseAdmin.from('discord_guilds').select('guild_id').eq('tenant_id', id),
      supabaseAdmin
        .from('tenant_staff')
        .select('staff_id', { count: 'exact', head: true })
        .eq('tenant_id', id),
      supabaseAdmin
        .from('integration_secrets')
        .select('tenant_id')
        .eq('key', 'brevo_api_key')
        .eq('tenant_id', id)
        .maybeSingle(),
    ]);

  const guildIds = ((guildsRes.data ?? []) as Array<{ guild_id: string }>).map(
    (g) => g.guild_id
  );

  // La configuration Discord est clé par serveur : sans serveur, rien à lire.
  let configuredKeys = 0;
  if (guildIds.length > 0) {
    const { data: cfg, error: cErr } = await supabaseAdmin
      .from('tenant_discord_config')
      .select(['guild_id', ...CONFIG_KEYS].join(', ') as '*')
      .in('guild_id', guildIds);
    if (cErr) {
      logger.error('[admin/tenant-overview] discord config error', cErr);
    }
    for (const row of (cfg ?? []) as unknown as Array<Record<string, unknown>>) {
      configuredKeys += countConfiguredKeys(row);
    }
  }

  const staffCount = staffRes.count ?? 0;
  const hasEmailSender = Boolean(emailRes.data);

  const volumes = Object.fromEntries(
    TENANT_DOMAINS.map((d, i) => [d.key, volumeValues[i]])
  ) as Record<TenantDomainKey, number | null>;

  const lifeSigns = Object.fromEntries(
    LIFE_SIGNS.map((s, i) => [s.key, signValues[i]])
  ) as Record<LifeSignKey, string | null>;

  const payload: TenantOverview = {
    lifeSigns,
    volumes,
    plan: {
      plan: planState.plan,
      effectivePlan: eff,
      status: planState.plan_status,
      expiresAt: planState.plan_expires_at,
      isTrial: t.plan_is_trial === true,
      daysRemaining: planState.plan_expires_at
        ? Math.ceil((Date.parse(planState.plan_expires_at) - nowMs) / DAY_MS)
        : null,
      botEnabled,
    },
    readiness: {
      blockers: computeBlockers({
        isActive: t.is_active !== false,
        botEnabled,
        guildCount: guildIds.length,
        staffCount,
        configuredKeys,
        hasEmailSender,
      }),
      guildCount: guildIds.length,
      staffCount,
      configuredKeys,
      hasEmailSender,
    },
    createdAt: t.created_at,
  };

  return res.status(200).json(payload);
}

// `caster` en garde d'entrée, gating fin à l'intérieur : c'est la porte de la
// fiche `/api/admin/tenants/[id]`, et cet endpoint n'en est que la vue d'ensemble.
export default withStaffRoute(handler, 'caster');
