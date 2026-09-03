// pages/[tenantSlug]/news/index.tsx
//
// Actualités D'UN ESPACE : `/mon-espace/news`.
//
// Même chemin que la route historique, au préfixe près — c'est ce qui permet
// au middleware de réécrire un domaine propre par simple préfixage.
//
// `basePath` est passé au rendu pour que les liens des cartes restent dans
// l'espace : sans lui, un clic renverrait vers l'article homonyme de la
// plateforme.

import NewsIndex from '@/components/News/NewsIndex';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { loadPublicNews, type PublicNewsResult } from '@/utils/publicData/news';
import { withTenantPage } from '@/utils/tenantPage';

export const getServerSideProps = withTenantPage<PublicNewsResult>(
  async ({ tenantId }) => loadPublicNews(tenantId)
);

function TenantNewsIndexPage(
  props: PublicNewsResult & { tenantSlug: string }
) {
  return <NewsIndex {...props} basePath={`/${props.tenantSlug}`} />;
}

const seo: SeoProps = {
  title: { fr: 'Actualités', en: 'News' },
  description: {
    fr: 'Les actualités de cet espace : annonces, résultats et coulisses.',
    en: 'News from this space: announcements, results and behind-the-scenes.',
  },
};

TenantNewsIndexPage.seo = seo;

export default TenantNewsIndexPage;
