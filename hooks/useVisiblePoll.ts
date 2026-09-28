// hooks/useVisiblePoll.ts
//
// Le sondage de SECOURS des écrans de la régie (cockpit, director, console
// live) : le temps réel reste la source principale, ceci rattrape ce qu'il a
// manqué.
//
// DEUX RÈGLES, qu'aucune copie ne respectait toutes :
//   1. rien ne part quand l'onglet est caché (les trois le faisaient) ;
//   2. on relit AU RETOUR sur l'onglet — seule la console live le faisait.
//      Le cockpit et le director attendaient le prochain tour, jusqu'à 30 s :
//      l'opératrice qui revient d'OBS regardait un écran périmé pile au
//      moment où elle revient pour agir.
//
// Le bloc était recopié dans trois pages, dont deux gelées en taille : il
// vit ici. `fn` est relu à chaque rendu (réf), donc changer son identité ne
// relance pas le minuteur.

import { useEffect, useRef } from 'react';

function isVisible(): boolean {
  return (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  );
}

export function useVisiblePoll(
  fn: () => void,
  intervalMs: number,
  options: { immediate?: boolean } = {}
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const immediate = options.immediate === true;

  useEffect(() => {
    if (immediate) fnRef.current();
    const handle = setInterval(() => {
      if (isVisible()) fnRef.current();
    }, intervalMs);
    const onVisible = () => {
      if (isVisible()) fnRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, immediate]);
}
