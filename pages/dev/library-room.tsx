// pages/dev/library-room.tsx — démo de développement d'une salle
// MULTIJOUEUSE de la Women's Library (lot 5) : l'écran réel d'une salle
// (moteur, pseudos, bulles, menu d'un avatar, liste des présentes) branché sur
// un Realtime EN MÉMOIRE (features/player/library/dev/fakeRealtime.ts), avec
// des joueuses simulées et les événements serveur (expulsion, bannissement,
// blocage). Aucun réseau. Sert tant que la migration `library_realtime.sql`
// n'est pas appliquée : les canaux privés réels refusent alors toute jonction.
//
// 404 en production : ce n'est pas une page du produit.

import type { GetServerSideProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import DevRoomHarness from '@/features/player/library/dev/DevRoomHarness';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

export default function LibraryRoomDevPage() {
  return (
    <div data-page="library-room-dev">
      <DevRoomHarness />
    </div>
  );
}

const libraryRoomDevSeo: SeoProps = {
  title: "Women's Library (room, dev)",
  noindex: true,
};

LibraryRoomDevPage.seo = libraryRoomDevSeo;
