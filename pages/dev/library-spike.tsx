// pages/dev/library-spike.tsx — démo de développement du moteur Women's
// Library (docs/PLAN-womens-library.md, lots 1 et 3) : une salle en dur, sans
// réseau, avec les sprites de public/library/spike.
//   ?room=demo (par défaut) | hall | reading
//
// 404 en production : ce n'est pas une page du produit.
// Le canvas est chargé côté client seulement (next/dynamic, ssr: false).

import type { GetServerSideProps } from 'next';
import dynamic from 'next/dynamic';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { type LayoutId, layoutIdOf } from '@/features/player/library/layouts';

const LibrarySpikeCanvas = dynamic(
  () => import('@/features/player/library/ui/LibrarySpikeCanvas'),
  {
    ssr: false,
    loading: () => <p className="p-4 font-mono text-[12px]">…</p>,
  }
);

type Props = { layout: LayoutId };

export const getServerSideProps: GetServerSideProps<Props> = async ({
  query,
}) =>
  process.env.NODE_ENV === 'production'
    ? { notFound: true }
    : { props: { layout: layoutIdOf(query.room) } };

export default function LibrarySpikePage({ layout }: Props) {
  return (
    <div data-page="library-spike">
      <LibrarySpikeCanvas layout={layout} />
    </div>
  );
}

const librarySpikeSeo: SeoProps = {
  title: "Women's Library (spike)",
  noindex: true,
};

LibrarySpikePage.seo = librarySpikeSeo;
