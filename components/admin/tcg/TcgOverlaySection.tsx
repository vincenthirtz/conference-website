// components/admin/tcg/TcgOverlaySection.tsx
//
// TOUT L'OVERLAY TCG, EN UN SEUL ENDROIT — Diffusion › Overlays :
//   * la santé du drop Twitch (`TcgDropHealthCard`) : récompense de points de
//     chaîne + souscription EventSub, ce qui fait TOMBER les cartes ;
//   * le jeton de la source OBS (`TcgOverlayCard`), qui les ANNONCE ;
//   * son habillage (`TcgOverlayThemeCard`).
// Ces réglages étaient éclatés entre « Twitch & interactions » et l'onglet
// Économie du TCG : pour préparer une soirée, il fallait savoir où chercher.
//
// Droit `manage_tcg` pour le jeton et l'habillage (routes
// /api/admin/tcg/overlay-token et overlay-theme) ; la carte du drop exige en
// plus `manage_broadcast` et se masque seule sans lui.

import { useAdminT } from '@/lib/i18n/useAdminT';
import { lazyPanel } from '@/components/admin/lazyPanel';
import { withAdminQuery } from '@/features/admin/_shared/query';
import nsAdminTcgOverview from '@/lib/i18n/locales/admin-fr/adminTcgOverview';

// Lit par le cache de requêtes : d'où `withAdminQuery` sur la section.
const TcgDropHealthCard = lazyPanel(
  () => import('@/components/admin/broadcast/TcgDropHealthCard')
);
const TcgOverlayCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayCard')
);
const TcgOverlayThemeCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayThemeCard')
);

function TcgOverlaySection() {
  const t = useAdminT(nsAdminTcgOverview);
  return (
    <>
      <TcgDropHealthCard />
      <TcgOverlayCard
        labels={{
          heading: t.overlayHeading,
          subtitle: t.overlaySubtitle,
          none: t.overlayNone,
          createdAt: t.overlayCreatedAt,
          lastUsedAt: t.overlayLastUsedAt,
          neverUsed: t.overlayNeverUsed,
          reveal: t.overlayReveal,
          hide: t.overlayHide,
          copy: t.overlayCopy,
          copied: t.overlayCopied,
          create: t.overlayCreate,
          rotate: t.overlayRotate,
          rotateWarning: t.overlayRotateWarning,
          revoke: t.overlayRevoke,
          revokeWarning: t.overlayRevokeWarning,
          working: t.overlayWorking,
          loadError: t.overlayLoadError,
          saveError: t.overlaySaveError,
          obsHint: t.overlayObsHint,
          copyRegie: t.overlayCopyRegie,
          regieHint: t.overlayRegieHint,
        }}
      />
      <TcgOverlayThemeCard
        labels={{
          heading: t.themeHeading,
          subtitle: t.themeSubtitle,
          previewTitle: t.themePreviewTitle,
          accent: t.themeAccent,
          position: t.themePosition,
          positionTopLeft: t.themePosTopLeft,
          positionTopRight: t.themePosTopRight,
          positionBottomLeft: t.themePosBottomLeft,
          positionBottomRight: t.themePosBottomRight,
          dropLine: t.themeDropLine,
          winLine: t.themeWinLine,
          linePlaceholder: t.themeLinePlaceholder,
          lineHint: t.themeLineHint,
          media: t.themeMedia,
          mediaHint: t.themeMediaHint,
          mediaChoose: t.themeMediaChoose,
          mediaRemove: t.themeMediaRemove,
          saving: t.themeSaving,
          saved: t.themeSaved,
          loadError: t.themeLoadError,
          saveError: t.themeSaveError,
          errUnsupportedType: t.themeErrUnsupportedType,
          errTooLarge: t.themeErrTooLarge,
          errContentMismatch: t.themeErrContentMismatch,
          errInvalidColor: t.themeErrInvalidColor,
          previewDropEyebrow: t.themePreviewDropEyebrow,
          previewWinEyebrow: t.themePreviewWinEyebrow,
          previewDropLine: t.themePreviewDropLine,
          previewWinLine: t.themePreviewWinLine,
          previewName: t.themePreviewName,
        }}
      />
    </>
  );
}

export default withAdminQuery(TcgOverlaySection);
