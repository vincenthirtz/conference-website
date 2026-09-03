// pages/news/index.tsx
// Liste paginée des actualités du SITE (table `news`, articles publiés).
// À distinguer de /actualites qui agrège les news/patch-notes Blizzard.
//
// Route de l'espace HISTORIQUE : `DEFAULT_TENANT_ID`, génération statique
// (ISR 5 min). Les autres espaces passent par `pages/[tenantSlug]/news`, en
// SSR. Chargement et rendu sont communs aux deux.

import type { GetStaticProps } from 'next';
import NewsIndex from '@/components/News/NewsIndex';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadPublicNews, type PublicNewsResult } from '@/utils/publicData/news';

export const getStaticProps: GetStaticProps<PublicNewsResult> = async () => {
  const props = await loadPublicNews(DEFAULT_TENANT_ID);
  return { props, revalidate: 300 };
};

function PlatformNewsIndexPage(props: PublicNewsResult) {
  return <NewsIndex {...props} />;
}

const newsIndexSeo: SeoProps = {
  title: {
    fr: 'Actualités du site',
    en: 'Site news',
  },
  description: {
    fr: "Toutes les actualités de l'OW Women's Cup : annonces, coulisses du tournoi et nouvelles de la communauté esport féminine.",
    en: "All the latest from OW Women's Cup: announcements, behind-the-scenes and news from the women's esport community.",
  },
};

PlatformNewsIndexPage.seo = newsIndexSeo;

export default PlatformNewsIndexPage;
