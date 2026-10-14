// components/admin/tcg/TcgOverlaySection.tsx
//
// L'OVERLAY TCG — Diffusion › Overlays : l'habillage des annonces
// (`TcgOverlayThemeCard`). Les annonces s'affichent dans la source Régie
// (`/overlay/regie`), servies par espace : plus de lien à jeton à émettre ni à
// coller.
//
// La santé du drop Twitch (`TcgDropHealthCard`) n'est plus ici : elle vit
// dans l'onglet « Récompenses » de la même page, avec les points de chaîne
// dont le drop fait partie.
//
// Droit `manage_tcg` pour l'habillage (route /api/admin/tcg/overlay-theme).

import { useAdminT } from '@/lib/i18n/useAdminT';
import { lazyPanel } from '@/components/admin/lazyPanel';
import { withAdminQuery } from '@/features/admin/_shared/query';
import nsAdminTcgOverview from '@/lib/i18n/locales/admin-fr/adminTcgOverview';

// Lit par le cache de requêtes : d'où `withAdminQuery` sur la section.
const TcgOverlayThemeCard = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlayThemeCard')
);

function TcgOverlaySection() {
  const t = useAdminT(nsAdminTcgOverview);
  return (
    <>
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
