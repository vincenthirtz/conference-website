// SEO et URL canonique de la fiche équipe publique (`/team/[slug]`).
//
// La page posait son propre <Head> (og, canonical, twitter) EN PLUS de celui
// de DefaultSeo : next/head ne dédoublonne pas les `property`, on sortait donc
// deux og:type, deux og:image, deux og:title et deux <link rel=canonical>. Et
// les deux canonical pouvaient se contredire — DefaultSeo prend le chemin
// demandé, la page prenait le slug. Désormais la page ne fait que fournir
// `props.seo` (lu par `_app.tsx`), et toute URL de repli (UUID, nom,
// short_name) redirige vers l'unique URL canonique : le chemin demandé EST
// alors le canonique, et DefaultSeo n'a plus rien à contredire.
//
// Module pur (pas de Supabase, pas de React) : testé sans charger la page.

import type { SeoProps } from '@/components/Seo/DefaultSeo';

export const TEAM_SEO_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://owwomenscup.fr';

export type TeamSeoInput = {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  bio?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
};

export function truncate(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function toAbsoluteUrl(
  path: string | null | undefined
): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${TEAM_SEO_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Segment d'URL canonique : le slug, sinon l'id (équipe sans slug). */
export function teamCanonicalSegment(team: {
  id: string;
  slug?: string | null;
}): string {
  return team.slug || team.id;
}

export function teamCanonicalPath(team: {
  id: string;
  slug?: string | null;
}): string {
  return `/team/${encodeURIComponent(teamCanonicalSegment(team))}`;
}

/**
 * Destination de la redirection permanente quand la fiche a été atteinte par
 * une URL de repli (UUID, nom, short_name — ou un slug d'une autre casse), ou
 * `null` si le paramètre reçu est déjà le segment canonique. `param` est la
 * valeur DÉCODÉE que Next passe dans `ctx.params`.
 *
 * Pas de boucle : la destination est résolue par la recherche exacte sur le
 * slug (ou sur l'id pour une équipe sans slug), qui renvoie ici `null`.
 */
export function teamRedirectDestination(
  param: string,
  team: { id: string; slug?: string | null }
): string | null {
  return param === teamCanonicalSegment(team) ? null : teamCanonicalPath(team);
}

export function buildTeamSeo(team: TeamSeoInput): SeoProps {
  const authored = team.description || team.bio;
  const canonicalUrl = `${TEAM_SEO_BASE_URL}${teamCanonicalPath(team)}`;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.name,
    url: canonicalUrl,
    ...(team.logo_url ? { logo: toAbsoluteUrl(team.logo_url) } : {}),
    ...(authored ? { description: truncate(authored, 300) } : {}),
  };

  return {
    // Le nom d'une équipe ne se traduit pas ; DefaultSeo ajoute « | site ».
    title: team.name,
    // Texte saisi par l'équipe : une seule langue, rendu tel quel. Sinon,
    // description générique bilingue.
    description: authored
      ? truncate(authored, 155)
      : {
          fr: `Découvrez l'équipe ${team.name} sur OW Women's Cup : effectif, palmarès et actualités.`,
          en: `Discover the ${team.name} team on OW Women's Cup: roster, achievements and news.`,
        },
    ...(team.banner_url || team.logo_url
      ? { image: toAbsoluteUrl(team.banner_url || team.logo_url) }
      : {}),
    type: 'website',
    jsonLd,
  };
}

/** Repli statique (`Component.seo`) si `props.seo` venait à manquer. */
export const teamPageSeoFallback: SeoProps = {
  title: { fr: 'Équipe', en: 'Team' },
  description: {
    fr: "Fiche publique d'une équipe de l'OW Women's Cup : effectif, palmarès et matchs.",
    en: "Public page of an OW Women's Cup team: roster, achievements and matches.",
  },
};
