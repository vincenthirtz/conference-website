// features/player/library/ui/shop/FurnitureThumb.tsx — la vignette d'un meuble
// (sprite rotation 0 du manifeste), ajustée à sa boîte.
// Décorative : le nom du meuble est écrit à côté. Sans sprite (manifeste
// absent, meuble pas encore rendu, image en échec), une boîte neutre tient la
// place.
//
// Lot 11 : une IMAGE chargée paresseusement (`loading="lazy"`), et non plus un
// fond CSS — avec 200 meubles et plus, seule la page visible de la boutique se
// télécharge.

import { useState } from 'react';
import type { SpriteFrame } from '../../engine/assets';

export default function FurnitureThumb({
  frame,
  size = 72,
}: {
  frame: SpriteFrame | null;
  /** Côté de la boîte, px CSS. */
  size?: number;
}) {
  const url = frame?.src ?? null;
  const [failed, setFailed] = useState<string | null>(null);
  const ready = url !== null && failed !== url;
  return (
    <span
      aria-hidden
      data-sprite={ready ? 'ready' : 'placeholder'}
      className={`inline-flex shrink-0 items-end justify-center overflow-hidden rounded-[var(--r-ctrl,4px)] ${
        ready
          ? ''
          : 'border border-dashed border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
      style={{ width: size, height: size }}
    >
      {ready && (
        // biome-ignore lint/performance/noImgElement: sprite statique du pipeline, déjà au bon format (WebP 2×) ; next/image n'apporte rien ici.
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(url)}
          className="max-h-full max-w-full object-contain object-bottom"
        />
      )}
    </span>
  );
}
