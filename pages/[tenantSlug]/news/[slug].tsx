// pages/[tenantSlug]/news/[slug].tsx
//
// Article d'actualité D'UN ESPACE : `/mon-espace/news/mon-article`.
//
// Un slug d'article n'est unique QUE dans son espace : la résolution passe
// donc obligatoirement par le tenant, sinon deux espaces ayant chacun un
// article « finale » se serviraient l'un l'autre.

import NewsArticle from '@/components/News/NewsArticle';
import {
  loadPublicNewsArticle,
  type NewsArticleProps,
} from '@/utils/publicData/newsArticle';
import { getTenantIdBySlug } from '@/utils/tenant';
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps<NewsArticleProps> = async (
  ctx
) => {
  const rawTenant = ctx.params?.tenantSlug;
  const rawSlug = ctx.params?.slug;
  const tenantSlug = typeof rawTenant === 'string' ? rawTenant : null;
  const slug = typeof rawSlug === 'string' ? rawSlug : null;
  if (!tenantSlug || !slug) return { notFound: true };

  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return { notFound: true };

  const result = await loadPublicNewsArticle(tenantId, slug);
  if (result.kind === 'not_found') return { notFound: true };

  // `basePath` garde les liens et l'URL canonique dans l'espace du lecteur.
  return { props: { ...result.props, basePath: `/${tenantSlug}` } };
};

export default NewsArticle;
