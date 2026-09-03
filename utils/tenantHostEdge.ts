// utils/tenantHostEdge.ts
//
// Résolution domaine → slug d'espace, côté EDGE (middleware).
//
// Pourquoi ici et pas dans `utils/tenant.ts` : le middleware s'exécute dans le
// runtime Edge, qui n'a ni `supabaseAdmin` (clé de service, jamais côté edge)
// ni les modules Node. On interroge donc PostgREST directement avec la clé
// anon — la table `tenants` porte une policy `SELECT` ouverte aux rôles
// `anon`/`authenticated` sur les lignes actives (\`tenants_select_public\`), et
// slug/domaine n'ont rien de secret.
//
// Coût : zéro requête pour le domaine de la plateforme et les previews, qui
// sortent avant tout appel réseau. Pour un domaine d'espace, un appel par
// isolat toutes les 60 s.

const CACHE_TTL_MS = 60_000;

type Entry = { slug: string | null; expiresAt: number };
const cache = new Map<string, Entry>();

/** Purge le cache. Usage test. */
export function __resetTenantHostEdgeCacheForTests(): void {
  cache.clear();
}

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  const colon = h.lastIndexOf(':');
  if (colon !== -1 && !h.includes(']')) h = h.slice(0, colon);
  h = h.replace(/\.$/, '');
  return h || null;
}

/**
 * Hôtes de la PLATEFORME : domaine officiel, previews Netlify, dev local. On
 * n'y résout aucun espace — le comportement historique s'applique, sans le
 * moindre appel réseau.
 */
function isPlatformHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return true;
  }
  if (host.endsWith('.netlify.app')) return true;

  const defaults = new Set(['owwomenscup.fr', 'www.owwomenscup.fr']);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl).hostname.toLowerCase();
      if (parsed) {
        defaults.add(parsed);
        defaults.add(
          parsed.startsWith('www.') ? parsed.slice(4) : `www.${parsed}`
        );
      }
    } catch {
      // URL mal formée → les défauts suffisent.
    }
  }
  return defaults.has(host);
}

/**
 * Slug de l'espace propriétaire de ce domaine, ou `null`.
 *
 * Ne jette jamais : une panne de lookup rend `null`, c'est-à-dire « pas de
 * réécriture » — le rendu par défaut, jamais une erreur au visiteur.
 */
export async function resolveTenantSlugByHost(
  host: string | null | undefined
): Promise<string | null> {
  const norm = normalizeHost(host);
  if (!norm || isPlatformHost(norm)) return null;

  const now = Date.now();
  const cached = cache.get(norm);
  if (cached && cached.expiresAt > now) return cached.slug;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  let slug: string | null = null;
  try {
    const url =
      `${base}/rest/v1/tenants` +
      `?select=slug&is_active=eq.true&custom_domain=eq.${encodeURIComponent(norm)}&limit=1`;
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return null; // erreur transitoire → ne pas cacher un faux négatif
    const rows = (await r.json()) as Array<{ slug?: string }>;
    const found = Array.isArray(rows) ? rows[0]?.slug : null;
    slug = typeof found === 'string' && found ? found : null;
  } catch {
    return null;
  }

  cache.set(norm, { slug, expiresAt: now + CACHE_TTL_MS });
  return slug;
}

/**
 * Chemins qui existent en variante préfixée par espace
 * (`pages/[tenantSlug]/...`).
 *
 * Cette liste EXISTE parce qu'une réécriture vers une page absente donnerait un
 * 404 là où le visiteur voit aujourd'hui le contenu de la plateforme. Tant
 * qu'une page n'est pas migrée, on préfère le comportement actuel à une page
 * d'erreur. Chaque migration ajoute son motif ici.
 */
const TENANT_ROUTES: RegExp[] = [
  /^\/tournaments\/?$/,
  /^\/tournois\/?$/,
  /^\/news\/?$/,
  /^\/news\/[^/]+\/?$/,
];

export function hasTenantVariant(pathname: string): boolean {
  return TENANT_ROUTES.some((re) => re.test(pathname));
}
