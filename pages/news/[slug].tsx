// pages/news/[slug].tsx
//
// Article d'actualité de l'espace HISTORIQUE : `DEFAULT_TENANT_ID`, en
// génération statique à la demande (`fallback: 'blocking'`, ISR 5 min). Les
// autres espaces passent par `pages/[tenantSlug]/news/[slug]`, en SSR.
//
// Chargement (`loadPublicNewsArticle`) et rendu (`NewsArticle`) sont communs.

import type { GetStaticPaths, GetStaticProps } from 'next';
import NewsArticle from '@/components/News/NewsArticle';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import {
  loadPublicNewsArticle,
  type NewsArticleProps,
} from '@/utils/publicData/newsArticle';

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<NewsArticleProps> = async (
  context
) => {
  const slug = context.params?.slug;
  if (!slug || Array.isArray(slug)) {
    return { notFound: true, revalidate: 60 };
  }

  const result = await loadPublicNewsArticle(DEFAULT_TENANT_ID, slug);
  if (result.kind === 'not_found') return { notFound: true, revalidate: 60 };
  if (result.kind === 'error') {
    return { props: result.props, revalidate: 60 };
  }
  return { props: result.props, revalidate: 300 };
};

export default NewsArticle;
