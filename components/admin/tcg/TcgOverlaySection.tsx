// components/admin/tcg/TcgOverlaySection.tsx
//
// L'overlay TCG de l'antenne : le jeton de sa source OBS (`TcgOverlayCard`) et
// son habillage (`TcgOverlayThemeCard`).
//
// DEUX ÉCRANS, UN SEUL CÂBLAGE. On le règle depuis le TCG (onglet Économie) ET
// depuis Diffusion › Overlays, où l'on prépare toutes les sources d'une
// soirée. Les deux cartes attendent une cinquantaine de libellés : les câbler
// deux fois, c'était la certitude qu'un libellé ajouté ici manque là.
//
// Droit `manage_tcg` : c'est celui des routes appelées
// (`/api/admin/tcg/overlay-token`, `overlay-theme`). L'appelant décide
// d'afficher la section ; les routes gardent leur contrôle.

import { useAdminT } from '@/lib/i18n/useAdminT';
import { lazyPanel } from '@/components/admin/lazyPanel';
import nsAdminTcgOverview from '@/lib/i18n/locales/admin-fr/adminTcgOverview';

const TcgOverlayCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayCard')
);
const TcgOverlayThemeCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayThemeCard')
);

export default function TcgOverlaySection() {
  const t = useAdminT(nsAdminTcgOverview);
  return (
    <>
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
