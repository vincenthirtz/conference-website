// hooks/useStageFit.ts
//
// Cadre de conception 1920×1080 des sources OBS « statiques » (`/overlay/don`,
// `/overlay/scrims`) et facteur pour le faire tenir dans la fenêtre.
//
// Une source navigateur OBS n'a pas forcément la taille du stream (800×600 par
// défaut). Mise en page en pixels dans une fenêtre plus petite, un panneau
// déborde et `overflow-hidden` coupe le texte. On dessine donc toujours sur le
// même cadre, qu'on réduit en bloc et qu'on centre : rien ne se déforme ni ne
// se coupe.

import { useEffect, useState } from 'react';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function useStageFit(): number {
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const update = () =>
      setFit(
        Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
      );
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return fit;
}

/** Style du cadre : centré dans la fenêtre, mis à l'échelle en bloc. */
export function stageStyle(fit: number) {
  return {
    width: STAGE_W,
    height: STAGE_H,
    transform: `translate(-50%, -50%) scale(${fit})`,
  } as const;
}
