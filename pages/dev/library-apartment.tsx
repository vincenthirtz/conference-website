// pages/dev/library-apartment.tsx — démo de développement de « Mon
// appartement » (Women's Library, lot 4) : l'écran réel, branché sur un client
// EN MÉMOIRE (features/player/library/dev/fakeClient.ts) — un appartement,
// une dizaine de meubles, un solde. Sert à voir et éprouver le mode déco sans
// l'API (inaccessible en local).
//
// 404 en production : ce n'est pas une page du produit.

import type { GetServerSideProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import DevApartmentHarness from '@/features/player/library/dev/DevApartmentHarness';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

export default function LibraryApartmentDevPage() {
  return (
    <div data-page="library-apartment-dev">
      <DevApartmentHarness />
    </div>
  );
}

const libraryApartmentDevSeo: SeoProps = {
  title: "Women's Library (apartment, dev)",
  noindex: true,
};

LibraryApartmentDevPage.seo = libraryApartmentDevSeo;
