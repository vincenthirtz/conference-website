// pages/api/admin/tenants/readiness.ts
//
// GET : « qu'est-ce qui manque à chaque espace pour fonctionner ? »
//
// La liste des espaces dit ce qu'ils SONT (slug, plan, dates). Elle ne dit pas
// ce qu'ils FONT, et c'est pourtant la seule question qui se pose après une
// création : un espace peut exister depuis trois semaines, avoir l'air en
// règle, et ne rien faire du tout — bot 403 parce que le plan a expiré, aucun
// email parce que le compte d'envoi n'est pas renseigné, salons vides parce que
// personne n'a fini la configuration. Rien de tout cela ne remonte
// spontanément : ça se manifeste le jour d'un match, du mauvais côté.
//
// Cet endpoint agrège les cinq conditions qui déterminent réellement si un
// espace tourne, en requêtes groupées (pas de N+1) :
//
//   1. un serveur Discord rattaché ;
//   2. au moins un salon configuré (sinon les fonctionnalités sont en veille) ;
//   3. quelqu'un de rattaché — sans une seule ligne `tenant_staff`, personne ne
//      peut basculer sur l'espace pour l'administrer ;
//   4. un compte d'envoi d'emails (sinon AUCUN email ne part) ;
//   5. un plan qui inclut le bot, et son échéance si c'est un essai.
//
// La réponse porte aussi de quoi AGIR, pas seulement de quoi constater :
//   - `guilds` : les serveurs de l'espace, pour offrir un lien direct vers la
//     configuration de chacun (l'écran de réglages est par serveur) ;
//   - `botInviteUrl` : l'URL d'invitation du bot, qui dépend de
//     `DISCORD_CLIENT_ID` et ne peut donc pas être construite côté client.
//
// Portée : owner de la PLATEFORME (`manage_tenant` + `scope: 'platform'`),
// comme tout le hub d'onboarding. C'est une vue de supervision transverse — un
// propriétaire d'espace n'a pas à lire l'état des autres.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { buildBotInviteUrl } from '@/utils/onboard';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import {
  effectivePlan,
  getPlanFeatures,
  type TenantPlan,
  type PlanStatus,
} from '@/utils/billing/planFeatures';
// Les critères vivent à part : la fiche d'un espace pose la même question pour
// UN espace (cf. /api/admin/tenants/[id]/overview), et deux définitions de
// « opérationnel » divergeraient au premier critère ajouté.
import {
  computeBlockers,
  countConfiguredKeys,
  CONFIG_KEYS,
} from '@/utils/tenants/readinessRules';

export type TenantReadiness = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  /** Plan réellement appliqué (un plan payant expiré retombe sur discovery). */
  effectivePlan: string;
  planStatus: string;
  planExpiresAt: string | null;
  isTrial: boolean;
  /** Jours restants avant échéance ; null si le plan n'expire pas. */
  daysRemaining: number | null;
  guildCount: number;
  /**
   * Serveurs de l'espace. L'écran de réglages Discord est PAR serveur : sans
   * cette liste, la vue ne peut pas y renvoyer directement.
   */
  guilds: Array<{
    guildId: string;
    /** Nom du serveur si connu (stocké dans `tenant_discord_config.extras`). */
    guildName: string | null;
    isPrimary: boolean;
    /** Clés de configuration renseignées POUR CE serveur. */
    configuredKeys: number;
  }>;
  /** Nombre de clés de configuration Discord renseignées (cf. CONFIG_KEYS). */
  configuredKeys: number;
  ownerCount: number;
  staffCount: number;
  hasBotSecrets: boolean;
  hasEmailSender: boolean;
  /** Le plan effectif inclut-il le bot Discord ? */
  botEnabled: boolean;
  /** Ce qui bloque, du plus bloquant au plus secondaire. */
  blockers: string[];
};

const DAY_MS = 86_400_000;

function countBy<T extends { tenant_id?: string | null }>(
  rows: T[] | null | undefined
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    const id = r.tenant_id;
    if (!id) continue;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-tenants-readiness'
    )
  ) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const { data: tenantRows, error } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, slug, name, is_active, created_at, kind, plan, plan_status, plan_expires_at, plan_is_trial'
    )
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[admin/tenants/readiness] tenants load error', error);
    return res.status(500).json({ error: 'Failed to load tenants.' });
  }

  type Row = {
    id: string;
    slug: string;
    name: string;
    is_active: boolean;
    created_at: string;
    kind?: string | null;
    plan?: string | null;
    plan_status?: string | null;
    plan_expires_at?: string | null;
    plan_is_trial?: boolean | null;
  };
  // Les espaces `developer` portent des clés d'API, pas un tournoi : les
  // mesurer sur « le bot répond-il ? » n'aurait aucun sens.
  const rows = ((tenantRows ?? []) as Row[]).filter(
    (t) => (t.kind ?? 'organizer') !== 'developer'
  );
  const ids = rows.map((t) => t.id);

  if (ids.length === 0) {
    return res
      .status(200)
      .json({ tenants: [], botInviteUrl: buildBotInviteUrl() });
  }

  const [guildsRes, configRes, staffRes, secretsRes, emailRes] =
    await Promise.all([
      supabaseAdmin
        .from('discord_guilds')
        .select('tenant_id, guild_id, is_primary')
        .in('tenant_id', ids),
      supabaseAdmin
        .from('tenant_discord_config')
        .select(['guild_id', 'extras', ...CONFIG_KEYS].join(', ') as '*'),
      supabaseAdmin
        .from('tenant_staff')
        .select('tenant_id, role')
        .in('tenant_id', ids),
      supabaseAdmin
        .from('tenant_secrets')
        .select('tenant_id')
        .in('tenant_id', ids),
      supabaseAdmin
        .from('integration_secrets')
        .select('tenant_id')
        .eq('key', 'brevo_api_key')
        .in('tenant_id', ids),
    ]);

  for (const [label, r] of [
    ['discord_guilds', guildsRes],
    ['tenant_discord_config', configRes],
    ['tenant_staff', staffRes],
    ['tenant_secrets', secretsRes],
    ['integration_secrets', emailRes],
  ] as const) {
    if (r.error) {
      // Une agrégation qui échoue ne doit pas faire tomber la vue : on le
      // journalise et le critère correspondant s'affichera comme absent.
      logger.error(`[admin/tenants/readiness] ${label} load error`, r.error);
    }
  }

  const guildRows = (guildsRes.data ?? []) as Array<{
    tenant_id: string;
    guild_id: string;
    is_primary?: boolean | null;
  }>;
  const guildCount = countBy(guildRows);
  const guildToTenant = new Map(
    guildRows.map((g) => [g.guild_id, g.tenant_id])
  );

  // Config Discord : la table est clé par `guild_id`, on la ramène au tenant.
  const configuredKeys = new Map<string, number>();
  const configRows = (configRes.data ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  // Par serveur aussi : chaque serveur a son propre écran de réglages, donc
  // son propre état d'avancement.
  const keysByGuild = new Map<string, number>();
  const nameByGuild = new Map<string, string>();
  for (const row of configRows) {
    const guildId = String(row.guild_id);
    const filled = countConfiguredKeys(row);
    keysByGuild.set(guildId, filled);

    // Le nom du serveur est déposé par l'auto-claim dans `extras` : c'est la
    // seule trace côté site (le site n'interroge pas Discord pour ça).
    const extras = row.extras as { guild_name?: unknown } | null;
    const name = extras?.guild_name;
    if (typeof name === 'string' && name.trim()) {
      nameByGuild.set(guildId, name.trim());
    }

    const tenantId = guildToTenant.get(guildId);
    if (!tenantId) continue;
    configuredKeys.set(tenantId, (configuredKeys.get(tenantId) ?? 0) + filled);
  }

  // Serveurs par espace, le principal d'abord.
  const guildsByTenant = new Map<
    string,
    Array<{
      guildId: string;
      guildName: string | null;
      isPrimary: boolean;
      configuredKeys: number;
    }>
  >();
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

  const staffRows = (staffRes.data ?? []) as Array<{
    tenant_id: string;
    role: string | null;
  }>;
  const staffCount = countBy(staffRows);
  const ownerCount = countBy(staffRows.filter((r) => r.role === 'owner'));

  const withSecrets = new Set(
    ((secretsRes.data ?? []) as Array<{ tenant_id: string }>).map(
      (r) => r.tenant_id
    )
  );
  const withEmail = new Set(
    ((emailRes.data ?? []) as Array<{ tenant_id: string }>).map(
      (r) => r.tenant_id
    )
  );

  const nowMs = Date.now();

  const tenants: TenantReadiness[] = rows.map((t) => {
    const planState = {
      plan: (t.plan ?? 'discovery') as TenantPlan,
      plan_status: (t.plan_status ?? 'active') as PlanStatus,
      plan_expires_at: t.plan_expires_at ?? null,
    };
    const eff = effectivePlan(planState, nowMs);
    const botEnabled = getPlanFeatures(eff).discordBot;

    const guilds = guildCount.get(t.id) ?? 0;
    const keys = configuredKeys.get(t.id) ?? 0;
    const owners = ownerCount.get(t.id) ?? 0;
    const staff = staffCount.get(t.id) ?? 0;
    const hasEmailSender = withEmail.has(t.id);

    const daysRemaining = t.plan_expires_at
      ? Math.ceil((Date.parse(t.plan_expires_at) - nowMs) / DAY_MS)
      : null;

    const blockers = computeBlockers({
      isActive: t.is_active !== false,
      botEnabled,
      guildCount: guilds,
      staffCount: staff,
      configuredKeys: keys,
      hasEmailSender,
    });

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
      daysRemaining,
      guildCount: guilds,
      guilds: guildsByTenant.get(t.id) ?? [],
      configuredKeys: keys,
      ownerCount: owners,
      staffCount: staff,
      hasBotSecrets: withSecrets.has(t.id),
      hasEmailSender,
      botEnabled,
      blockers,
    };
  });

  return res.status(200).json({
    tenants,
    // `null` si `DISCORD_CLIENT_ID` n'est pas configuré : l'UI doit le dire
    // plutôt que d'afficher un bouton qui ne mène nulle part.
    botInviteUrl: buildBotInviteUrl(),
  });
}

export default withStaffRoute(handler, {
  // Supervision transverse des espaces : c'est de l'onboarding, donc owner de
  // la PLATEFORME. La portée compte autant que la permission — un propriétaire
  // d'espace porte `manage_tenant` chez lui.
  permission: 'manage_tenant',
  scope: 'platform',
});
