// features/player/library/ui/avatar/AvatarSprite.tsx — un avatar, debout,
// face à la caméra : l'image d'attente (direction 4) découpée dans sa feuille
// de sprites, en fond CSS. Décoratif : le choix porte son propre libellé.

import type { AvatarSheet } from '../../engine/avatarSprites';
import { avatarIdleBox, cssUrl } from '../../sprites';

export default function AvatarSprite({
  sheet,
  height = 96,
}: {
  sheet: AvatarSheet | null;
  /** Hauteur affichée, px CSS. */
  height?: number;
}) {
  const box = avatarIdleBox(sheet, height);
  if (!box) {
    // Silhouette de remplacement : même encombrement, sans image.
    return (
      <span
        aria-hidden
        data-sprite="placeholder"
        className="inline-block rounded-full bg-[var(--s2,#1a1020)]"
        style={{ width: Math.round(height * 0.45), height }}
      />
    );
  }
  return (
    <span
      aria-hidden
      data-sprite="ready"
      className="inline-block bg-no-repeat"
      style={{
        width: box.width,
        height: box.height,
        backgroundImage: cssUrl(box.src),
        backgroundSize: `${box.backgroundWidth}px ${box.backgroundHeight}px`,
        backgroundPosition: `${box.offsetX}px ${box.offsetY}px`,
      }}
    />
  );
}
