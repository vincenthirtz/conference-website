// components/Halloween/HalloweenOverlayDecor.tsx
//
// La décoration d'Halloween des overlays OBS : les dessins et le CSS de
// HalloweenDecor, sans ce qui n'a pas de sens dans une source de stream. Pas de
// bouton (personne ne clique dans OBS : la grande citrouille reste un dessin),
// pas de stockage, et aucun décalage d'en-tête.
//
// Moins de monde que sur le site (deux chauves-souris, pas trois) : OBS fait
// tourner plusieurs sources à la fois. Le CSS (styles/globals.css, fin du bloc
// « Halloween ») retire aussi les lueurs en `filter`. Niveaux :
// ./halloweenOverlayLevels.

import { Bat, Ghost, Mummy, Pumpkin, Web, Witch } from './HalloweenDecor';
import type { HalloweenOverlayLevel } from './halloweenOverlayLevels';

export default function HalloweenOverlayDecor({
  level,
}: {
  level: HalloweenOverlayLevel;
}) {
  const moving = level !== 'corners';
  return (
    <div
      className={`hw-layer hw-layer--overlay hw-layer--${level}`}
      aria-hidden="true"
      data-test="halloween-overlay-decor"
    >
      <Web side="left" spider={moving} />
      <Web side="right" spider={moving} />
      {level === 'full' && (
        <>
          <Bat variant={1} />
          <Bat variant={2} />
          <Witch />
        </>
      )}
      {moving && (
        <>
          <Mummy />
          <Ghost />
          <span className="hw-pumpkin-small">
            <Pumpkin lit />
          </span>
          <span className="hw-pumpkin-big">
            <Pumpkin lit />
          </span>
        </>
      )}
    </div>
  );
}
