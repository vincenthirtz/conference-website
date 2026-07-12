// utils/embed.ts
//
// Résolution partagée du « chrome » des pages d'embed (`/embed/tournament/*`) :
// tenant, thème et couleur d'accent. Factorise le boilerplate SSR répété dans
// les 4 pages (bracket / standings / ffa / schedule).
//
// MULTI-TENANT : jusqu'ici les embeds étaient figés sur `DEFAULT_TENANT_ID`.
// Un `?tenant=<slug>` permet à un autre tenant d'embarquer SES tournois
// (résolu via `getTenantIdBySlug`, fallback default si absent/inconnu — donc
// rétro-compatible avec les embeds existants sans paramètre).
//
// THÉMATISATION : couleur d'accent appliquée en barre de marque sur l'embed.
// Priorité : `?accent=<hex>` explicite > branding white-label du tenant
// (accentColor puis primaryColor, déjà plan-gated + sanitizé dans
// `readTenantBranding`) > aucune. Le hex du query param est sanitizé en hex
// strict (anti-injection CSS) avant toute interpolation dans un style inline.

import {
  DEFAULT_TENANT_ID,
  getTenantIdBySlug,
  readTenantBranding,
  sanitizeHexColor,
} from './tenant';

export type EmbedTheme = 'light' | 'dark';

type EmbedQuery = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** `?theme=light` → 'light', sinon 'dark' (défaut historique). */
export function parseEmbedTheme(query: EmbedQuery): EmbedTheme {
  return firstParam(query.theme) === 'light' ? 'light' : 'dark';
}

/**
 * `?accent=RRGGBB` ou `?accent=%23RRGGBB` → hex strict sanitizé, ou null.
 * Le `#` est optionnel côté URL (souvent gênant à encoder) ; on le rajoute
 * avant sanitize.
 */
export function parseEmbedAccentParam(query: EmbedQuery): string | null {
  const raw = firstParam(query.accent);
  if (!raw) return null;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return sanitizeHexColor(withHash);
}

/** Résout le tenant depuis `?tenant=<slug>`, fallback `DEFAULT_TENANT_ID`. */
export async function resolveEmbedTenantId(query: EmbedQuery): Promise<string> {
  const slug = firstParam(query.tenant);
  if (slug) {
    const id = await getTenantIdBySlug(slug);
    if (id) return id;
  }
  return DEFAULT_TENANT_ID;
}

export type EmbedChrome = {
  tenantId: string;
  theme: EmbedTheme;
  accent: string | null;
};

/**
 * Résout tenant + thème + accent pour une requête d'embed. L'accent explicite
 * (`?accent=`) court-circuite le branding (pas de lookup DB inutile) ; sinon on
 * lit le branding white-label du tenant.
 */
export async function resolveEmbedChrome(
  query: EmbedQuery
): Promise<EmbedChrome> {
  const tenantId = await resolveEmbedTenantId(query);
  const theme = parseEmbedTheme(query);

  let accent = parseEmbedAccentParam(query);
  if (!accent) {
    const branding = await readTenantBranding(tenantId);
    accent = branding?.accentColor ?? branding?.primaryColor ?? null;
  }

  return { tenantId, theme, accent };
}
