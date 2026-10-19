// features/player/library/ui/shop/FurnitureThumb.tsx — la vignette d'un meuble
// (sprite rotation 0 du manifeste), en fond CSS ajusté à sa boîte.
// Décorative : le nom du meuble est écrit à côté. Sans sprite (manifeste
// absent, meuble pas encore rendu), une boîte neutre tient la place.

import type { SpriteFrame } from '../../engine/assets';
import { cssUrl } from '../../sprites';

export default function FurnitureThumb({
  frame,
  size = 72,
}: {
  frame: SpriteFrame | null;
  /** Côté de la boîte, px CSS. */
  size?: number;
}) {
  return (
    <span
      aria-hidden
      data-sprite={frame ? 'ready' : 'placeholder'}
      className={`inline-block shrink-0 rounded-[var(--r-ctrl,4px)] bg-no-repeat ${
        frame
          ? ''
          : 'border border-dashed border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
      style={{
        width: size,
        height: size,
        backgroundImage: frame ? cssUrl(frame.src) : undefined,
        backgroundSize: 'contain',
        backgroundPosition: 'center bottom',
      }}
    />
  );
}
