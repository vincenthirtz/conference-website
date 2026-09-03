// utils/publicData/newsArticle.ts
//
// Chargement d'un article public, POUR UN ESPACE.
//
// Extrait de `pages/news/[slug].tsx` pour que la route historique et la route
// par espace partagent la même requête — filtre `tenant_id` compris. Un slug
// n'est unique QUE dans son espace : sans ce filtre, deux espaces ayant chacun
// un article « finale » se serviraient l'un l'autre.

import { supabaseAdmin } from '@/utils/supabase';
import { resolveNewsImage } from '@/utils/news/newsImage';
import { logger } from '@/utils/logger';
import type { RelatedItem } from '@/components/News/RelatedNews';

export type NewsArticleProps = {
  title: string;
  content: string;
  slug?: string | null;
  tag?: string | null;
  excerpt?: string | null;
  imageUrl?: string | null;
  /** `imageUrl` est un logo (équipe ou tournoi) → cadrage `contain`. */
  imageFitContain?: boolean;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  newsId?: string | null;
  related?: RelatedItem[];
  error?: string | null;
  /** Préfixe d'espace pour les liens et l'URL canonique (`` sur la plateforme). */
  basePath?: string;
};

export type LoadNewsArticleResult =
  | { kind: 'ok'; props: NewsArticleProps }
  | { kind: 'not_found' }
  | { kind: 'error'; props: NewsArticleProps };

export async function loadPublicNewsArticle(
  tenantId: string,
  slug: string
): Promise<LoadNewsArticleResult> {
  if (!supabaseAdmin) return { kind: 'not_found' };

  const { data, error } = await supabaseAdmin
    .from('news')
    // `teams(logo_url)` : l'illustration se dérive de l'équipe liée quand
    // l'article n'a pas d'image propre (cf. utils/news/newsImage.ts).
    .select('*, teams(logo_url)')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    logger.error('[publicData/newsArticle] fetch error', { tenantId, error });
    return {
      kind: 'error',
      props: {
        title: '',
        content: '',
        error: 'Impossible de charger cette news.',
      },
    };
  }

  if (!data) return { kind: 'not_found' };

  // « À lire aussi » : la page était un cul-de-sac. Quelqu'un qui arrive d'un
  // partage repartait sans savoir qu'il y a d'autres actualités.
  const { data: relatedRows } = await supabaseAdmin
    .from('news')
    .select('id, slug, title, tag, image_url, published_at, teams(logo_url)')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .neq('id', data.id)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(3);

  const related: RelatedItem[] = (relatedRows ?? []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    tag: row.tag ?? null,
    imageUrl: resolveNewsImage(row.image_url, row.teams).url,
    publishedAt: row.published_at ?? null,
  }));

  const heroImage = resolveNewsImage(data.image_url, data.teams);

  return {
    kind: 'ok',
    props: {
      title: data.title || '',
      content: data.content || '',
      slug: data.slug || null,
      tag: data.tag || 'general',
      excerpt: data.excerpt || '',
      imageUrl: heroImage.url || '',
      imageFitContain: heroImage.fitContain,
      publishedAt: data.published_at || null,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null,
      newsId: data.id || null,
      related,
    },
  };
}
