// features/player/tcg/ui/lazyPanels.tsx — panneaux chargés À LA DEMANDE
// (`next/dynamic`), déclarés au NIVEAU MODULE (sinon chunk re-résolu à chaque
// rendu). Aucun n'est au-dessus de la ligne de flottaison : le premier
// affichage — solde, paquets, « Ouvrir » — ne doit pas les attendre, le jour
// où tout le monde vient ouvrir ses paquets du tournoi.
//
// `ssr: false` : la page est réservée à une joueuse connectée. Le squelette
// porte une hauteur voisine du panneau : rien ne saute à l'arrivée du chunk.
//
// Ces panneaux (components/tcg/*) portent eux-mêmes leurs gestes — forge,
// habillages, vitrine, fan art — et leurs garde-fous : inchangés ici.

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

const PanelLoading = () => (
  <Skeleton className="h-64 w-full" rounded="rounded-2xl" />
);

export const FanartSubmitPanel = dynamic(
  () => import('@/components/tcg/FanartSubmitPanel'),
  { ssr: false, loading: PanelLoading }
);
export const TcgShowcaseEditor = dynamic(
  () => import('@/components/tcg/TcgShowcaseEditor'),
  { ssr: false, loading: PanelLoading }
);
/** Les deux DÉBITS (forge, habillages) : la dépense de pièces GAGNÉES. */
export const TcgForgePanel = dynamic(
  () => import('@/components/tcg/TcgForgePanel'),
  { ssr: false, loading: PanelLoading }
);
export const TcgCosmeticsPanel = dynamic(
  () => import('@/components/tcg/TcgCosmeticsPanel'),
  { ssr: false, loading: PanelLoading }
);
/** L'invitation à déposer sa photo : se tait dès qu'une photo existe. */
export const TcgPhotoInvite = dynamic(
  () => import('@/components/tcg/TcgPhotoInvite'),
  { ssr: false, loading: () => null }
);
/** Même chargeur pour le rendu et pour le préchargement. */
export const loadPackReveal = () => import('@/components/tcg/TcgPackReveal');
export const TcgPackReveal = dynamic(loadPackReveal, {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" rounded="rounded-2xl" />,
});
