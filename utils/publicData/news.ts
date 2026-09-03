// utils/publicData/news.ts
//
// Liste publique des actualités, POUR UN ESPACE.
//
// Extrait de `pages/news/index.tsx` pour que la route historique et la route
// par espace (`pages/[tenantSlug]/news`) partagent la MÊME requête. Deux
// copies d'un filtre `tenant_id`, c'est une occasion d'en oublier un — et un
// filtre oublié n'échoue pas, il affiche les actualités d'un autre.

import { supabaseAdmin } from '@/utils/supabase';
import { resolveNewsImage } from '@/utils/news/newsImage';
import { logger } from '@/utils/logger';

export type NewsItem = {
  id: string;
  title: string;
  slug: string;
  tag: string;
  excerpt: string | null;
  imageUrl: string | null;
  /** `imageUrl` est un logo (équipe ou tournoi) → cadrage `contain`. */
  imageFitContain: boolean;
  publishedAt: string | null;
  createdAt: string | null;
};

export type PublicNewsResult = {
  news: NewsItem[];
  /** Distingue une panne d'une absence légitime d'articles. */
  loadError: boolean;
};

export async function loadPublicNews(
  tenantId: string
): Promise<PublicNewsResult> {
  if (!supabaseAdmin) return { news: [], loadError: true };

  const nowISO = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('news')
    .select(
      'id, title, slug, tag, excerpt, image_url, published_at, created_at, teams(logo_url)'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .or(`published_at.lte.${nowISO},published_at.is.null`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(60);

  if (error) {
    logger.error('[publicData/news] fetch error', { tenantId, error });
    return { news: [], loadError: true };
  }

  const news = (data ?? [])
    .filter((row: any) => row.slug)
    .map((row: any) => {
      const image = resolveNewsImage(row.image_url, row.teams);
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        tag: row.tag || 'general',
        excerpt: row.excerpt || null,
        imageUrl: image.url,
        imageFitContain: image.fitContain,
        publishedAt: row.published_at || null,
        createdAt: row.created_at || null,
      } as NewsItem;
    });

  return { news, loadError: false };
}
