// features/player/library/ui/apartment/decor/DecorThumb.tsx — la vignette d'un
// choix de décor (lot 12), composée avec les VRAIS sprites du manifeste :
//   - un sol : un losange de deux cases sur deux, le motif en fond répété ;
//   - un habillage de murs : le coin de la pièce (deux cases de chaque mur) ;
//   - une fenêtre ou une porte : la variante dans l'habillage choisi.
// Décorative (aria-hidden) : le choix porte son propre libellé. Sans
// manifeste, ou tant qu'un sprite manque, une pastille neutre.

import type { LibraryDecorChoice } from '@/config/library/decor';
import type { LibraryManifest } from '../../../engine/assets';
import { cssUrl } from '../../../sprites';
import {
  type DecorSlot,
  finishThumb,
  fitWallThumb,
  floorThumb,
  openingThumb,
} from './decorPickerModel';

export const THUMB_W = 76;
export const THUMB_H = 72;

function Placeholder() {
  return (
    <span
      aria-hidden
      data-thumb="placeholder"
      className="block rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1a1020)]"
      style={{ width: THUMB_W, height: THUMB_H }}
    />
  );
}

export default function DecorThumb({
  slot,
  value,
  choice,
  manifest,
}: {
  slot: DecorSlot;
  value: string;
  /** Le décor en cours : fenêtres et portes se montrent dans son habillage. */
  choice: LibraryDecorChoice;
  manifest: LibraryManifest | null;
}) {
  if (slot === 'floor') {
    const f = floorThumb(manifest, value);
    if (!f) return <Placeholder />;
    // Losange de 2 × 2 cases (128 × 64 px CSS) ramené à la largeur du cadre ;
    // son sommet haut est l'ancre du motif.
    const scale = THUMB_W / 128;
    const h = 64 * scale;
    return (
      <span
        aria-hidden
        data-thumb="floor"
        className="block"
        style={{
          width: THUMB_W,
          height: THUMB_H,
          paddingTop: (THUMB_H - h) / 2,
        }}
      >
        <span
          className="block"
          style={{
            width: THUMB_W,
            height: h,
            backgroundImage: cssUrl(f.src),
            backgroundRepeat: 'repeat',
            backgroundSize: `${f.width * scale}px ${f.height * scale}px`,
            backgroundPosition: `${THUMB_W / 2 - f.anchorX * scale}px 0px`,
            clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
          }}
        />
      </span>
    );
  }
  const thumb =
    slot === 'finish'
      ? finishThumb(manifest, value)
      : openingThumb(manifest, choice.finish, slot, value);
  if (!thumb) return <Placeholder />;
  const fit = fitWallThumb(thumb, THUMB_W, THUMB_H, thumb.width);
  return (
    <span
      aria-hidden
      data-thumb={slot}
      className="relative block overflow-hidden rounded-[var(--r-ctrl,4px)] bg-[#17131b]"
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      <span
        className="absolute block"
        style={{
          left: fit.x,
          top: fit.y,
          width: thumb.width,
          height: thumb.height,
          transform: `scale(${fit.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {thumb.layers.map((l, k) => (
          <span
            // Couches fixes, dans l'ordre de dessin.
            key={k}
            className="absolute block bg-no-repeat"
            style={{
              left: l.left,
              top: l.top,
              width: l.width,
              height: l.height,
              backgroundImage: cssUrl(l.src),
              backgroundSize: '100% 100%',
            }}
          />
        ))}
      </span>
    </span>
  );
}
