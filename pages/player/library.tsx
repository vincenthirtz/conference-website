// pages/player/library.tsx — coquille de la Women's Library
// (docs/PLAN-womens-library.md) : SEO, cache joueuse, coquille (session +
// redirection). Les écrans vivent dans le module features/player/library ; le
// moteur isométrique y est chargé à la demande (`next/dynamic`, ssr: false).
//
//   /player/library              → « Mon appartement » (lot 4) ;
//   /player/library?room=<uuid>  → visiter une salle par son adresse (lot 5
//                                   phase B). Tout autre `room` → l'appartement ;
//   /player/library?place=hall|reading_room → un lieu commun par son nom
//                                   (lot 7) : la salle est trouvée (ou créée)
//                                   par l'API. `room` l'emporte sur `place`.
//   /player/library?place=arena  → l'arène (lot 12 de docs/PLAN-tcg-2.md),
//                                   la même porte, un écran sans salle chargé
//                                   à la demande (`PlaceScreen`).
//
// `noindex` comme les autres pages de l'espace : un appartement personnel n'a
// rien à faire dans un moteur de recherche.

import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import {
  type LibraryView,
  libraryViewOf,
} from '@/features/player/library/roomStageModel';
import ApartmentScreen from '@/features/player/library/ui/apartment/ApartmentScreen';
import PlaceScreen from '@/features/player/library/ui/places/PlaceScreen';
import RoomScreen from '@/features/player/library/ui/room/RoomScreen';
import { loginHrefFor } from '@/utils/player/sessionExpiry';

function PlayerLibrary() {
  const t = useT(nsPlayerLibrary);
  const router = useRouter();
  // Page statique : `?room=` / `?place=` ne sont connus qu'une fois le
  // routeur prêt (doc de `next/router`, `isReady`) ; la vue s'en DÉDUIT à
  // chaque rendu, sans état. `undefined` : pas encore lu (même premier rendu
  // côté serveur et côté client, donc pas d'écart d'hydratation).
  const { room, place } = router.query;
  const view: LibraryView | undefined = router.isReady
    ? libraryViewOf({ room, place })
    : undefined;

  if (view === undefined) {
    return (
      <main className="pt-header pb-16" aria-busy="true">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-sm text-[var(--t2,#c7bfca)]">{t.loading}</p>
        </div>
      </main>
    );
  }
  if (view.kind === 'room')
    return <RoomScreen key={view.roomId} roomId={view.roomId} />;
  if (view.kind === 'place')
    return <PlaceScreen key={view.place} place={view.place} />;
  // L'arène (lot 12) : la porte des lieux ; son écran se charge à la demande.
  if (view.kind === 'arena') return <PlaceScreen key="arena" place="arena" />;
  return <ApartmentScreen />;
}

const playerLibrarySeo: SeoProps = {
  title: { fr: 'Women’s Library', en: 'Women’s Library' },
  description: {
    fr: 'Ton appartement dans la Women’s Library : meubles, décor et avatar.',
    en: 'Your apartment in the Women’s Library: furniture, decor and avatar.',
  },
  noindex: true,
};

PlayerLibrary.seo = playerLibrarySeo;

// Compte obligatoire : une visiteuse non connectée part se connecter et
// revient — à la salle qu'elle visitait (`?room=` gardé).
export default withPlayerQuery(
  withPlayerShell(PlayerLibrary, {
    redirectTo: (asPath) => loginHrefFor(asPath),
  })
);
