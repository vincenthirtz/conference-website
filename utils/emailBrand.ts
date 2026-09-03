// utils/emailBrand.ts
//
// Marque appliquée aux emails : nom, site, logo.
//
// Le problème. `utils/email.ts` figeait « OW Women's Cup », le logo 2026 et
// owwomenscup.fr dans la mise en page ET dans les objets. Les joueuses d'un
// autre espace recevaient donc des emails signés d'une association dont elles
// n'ont jamais entendu parler, avec des liens vers un site qui n'est pas le
// leur — au moment précis (invitation, check-in, accès équipe) où la confiance
// compte le plus.
//
// L'approche. La mise en page émet des jetons (`{{BRAND_*}}`) que `sendEmail`
// remplace à l'envoi, selon le `tenantId` transmis. Un appelant qui n'en passe
// pas produit exactement l'email d'avant : la marque par défaut est la nôtre.
// C'est ce qui permet de brancher les envois un par un, sans big bang sur les
// 25 gabarits.
//
// Le site du tenant vient de son `custom_domain` s'il en a un, sinon du
// préfixe de slug sur le domaine de la plateforme (`/mon-espace`), cohérent
// avec le routage public.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { DEFAULT_TENANT_ID } from './tenant';
import {
  tenantHasCapability,
  type TenantPlan,
  type PlanStatus,
} from './billing/planFeatures';

export type EmailBrand = {
  name: string;
  siteUrl: string;
  logoUrl: string;
};

/** Jetons remplacés à l'envoi. Volontairement improbables dans un contenu. */
export const BRAND_TOKENS = {
  name: '{{BRAND_NAME}}',
  siteUrl: '{{BRAND_SITE_URL}}',
  logoUrl: '{{BRAND_LOGO_URL}}',
} as const;

const PLATFORM_SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://owwomenscup.fr';

export const DEFAULT_EMAIL_BRAND: EmailBrand = {
  name: "OW Women's Cup",
  siteUrl: PLATFORM_SITE_URL,
  logoUrl: `${PLATFORM_SITE_URL}/img/logos/2026-logo.png`,
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { brand: EmailBrand; expiresAt: number }>();

/** Purge le cache de marque. Usage test. */
export function __resetEmailBrandCacheForTests(): void {
  cache.clear();
}

function normalizeDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase().replace(/\/+$/, '');
  // Hostname nu attendu (la colonne est validée à l'écriture) : on refuse tout
  // ce qui porte un schéma ou un chemin plutôt que de bricoler une URL.
  if (!host || /[/\s:]/.test(host)) return null;
  return host;
}

function sanitizeLogoUrl(value: unknown, siteUrl: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Un client mail ne résout pas les chemins relatifs : on absolutise.
  if (trimmed.startsWith('/')) return `${siteUrl}${trimmed}`;
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * Marque à appliquer pour ce tenant.
 *
 * Retombe sur la marque par défaut si : pas de tenant, tenant par défaut,
 * tenant introuvable/inactif, ou plan sans white-label (le palier gratuit
 * partage la marque de la plateforme — même règle que l'affichage web, cf.
 * `readTenantBranding`).
 */
export async function resolveEmailBrand(
  tenantId?: string | null
): Promise<EmailBrand> {
  if (!tenantId || tenantId === DEFAULT_TENANT_ID) return DEFAULT_EMAIL_BRAND;

  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.brand;

  if (!supabaseAdmin) return DEFAULT_EMAIL_BRAND;

  let brand = DEFAULT_EMAIL_BRAND;
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select(
        'name, slug, logo_url, custom_domain, is_active, plan, plan_status, plan_expires_at'
      )
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      logger.warn('[emailBrand] lookup failed', { tenantId, error: error.message });
      return DEFAULT_EMAIL_BRAND; // erreur transitoire → pas de cache
    }

    const row = data as {
      name?: string | null;
      slug?: string | null;
      logo_url?: string | null;
      custom_domain?: string | null;
      is_active?: boolean;
      plan?: string | null;
      plan_status?: string | null;
      plan_expires_at?: string | null;
    } | null;

    if (row && row.is_active !== false) {
      const slug = typeof row.slug === 'string' ? row.slug : '';
      const domain = normalizeDomain(row.custom_domain);
      // Sans domaine propre, l'espace vit sous son préfixe de slug.
      const siteUrl = domain
        ? `https://${domain}`
        : slug
          ? `${PLATFORM_SITE_URL}/${slug}`
          : PLATFORM_SITE_URL;

      const canWhiteLabel = tenantHasCapability(
        {
          plan: (row.plan ?? 'discovery') as TenantPlan,
          plan_status: (row.plan_status ?? 'active') as PlanStatus,
          plan_expires_at: row.plan_expires_at ?? null,
        },
        'whiteLabel',
        now
      );

      const name =
        typeof row.name === 'string' && row.name.trim()
          ? row.name.trim()
          : slug || DEFAULT_EMAIL_BRAND.name;

      brand = {
        // Le NOM et le SITE suivent le tenant quel que soit le plan : envoyer
        // « OW Women's Cup » aux joueuses d'un autre tournoi serait faux, pas
        // une simple absence de personnalisation.
        name,
        siteUrl,
        // Le LOGO, lui, est du white-label : le palier gratuit garde le nôtre.
        logoUrl:
          (canWhiteLabel
            ? sanitizeLogoUrl(row.logo_url, siteUrl)
            : null) ?? DEFAULT_EMAIL_BRAND.logoUrl,
      };
    }
  } catch (err) {
    logger.warn('[emailBrand] unexpected error', {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return DEFAULT_EMAIL_BRAND;
  }

  cache.set(tenantId, { brand, expiresAt: now + CACHE_TTL_MS });
  return brand;
}

const PLATFORM_ONLY_RE =
  /<!--BRAND_PLATFORM_ONLY-->[\s\S]*?<!--\/BRAND_PLATFORM_ONLY-->/g;

/**
 * Remplace les jetons de marque dans un texte, ainsi que les valeurs par
 * défaut littérales — les gabarits historiques écrivent « OW Women's Cup » et
 * l'URL en dur dans leurs objets et leurs corps, et les réécrire un par un
 * n'apporterait rien de plus que ce remplacement.
 *
 * Sans surprise : quand la marque EST celle par défaut, seuls les jetons sont
 * substitués et le rendu est identique à l'octet près.
 */
export function applyBrand(text: string, brand: EmailBrand): string {
  let out = text
    .split(BRAND_TOKENS.logoUrl)
    .join(brand.logoUrl)
    .split(BRAND_TOKENS.siteUrl)
    .join(brand.siteUrl)
    .split(BRAND_TOKENS.name)
    .join(brand.name);

  if (brand.name !== DEFAULT_EMAIL_BRAND.name) {
    // Les deux graphies d'apostrophe qui circulent dans les gabarits.
    out = out
      .split("OW Women's Cup")
      .join(brand.name)
      .split('OW Women’s Cup')
      .join(brand.name)
      .split('OW Women&apos;s Cup')
      .join(brand.name);
  }
  if (brand.siteUrl !== DEFAULT_EMAIL_BRAND.siteUrl) {
    out = out.split(DEFAULT_EMAIL_BRAND.siteUrl).join(brand.siteUrl);
  }

  // Ce qui n'appartient qu'à la plateforme (notre invitation Discord, par
  // exemple) disparaît quand l'email part au nom d'un autre espace. Le laisser
  // enverrait ses joueuses sur NOTRE serveur.
  if (brand.name !== DEFAULT_EMAIL_BRAND.name) {
    out = out.replace(PLATFORM_ONLY_RE, '');
  } else {
    out = out
      .split('<!--BRAND_PLATFORM_ONLY-->')
      .join('')
      .split('<!--/BRAND_PLATFORM_ONLY-->')
      .join('');
  }
  return out;
}
