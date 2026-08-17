// hooks/useDocumentVisible.ts
//
// Visibilité de l'onglet, comme état React.
//
// Le motif « ne rien faire quand l'onglet est en arrière-plan » était recopié à
// la main dans plusieurs pollers (PlayerBell, AdminTopBar, PlayerTopBar,
// useTwitchLive…) sous la forme d'un test `document.visibilityState` au moment
// du tick. Ça suffit pour SAUTER un tick, mais pas pour COUPER un abonnement
// temps réel — il faut pour ça une valeur réactive qui déclenche un rendu.
//
// Rend `true` au SSR et au premier rendu client (pas de mismatch d'hydratation) ;
// la valeur réelle est appliquée au montage.

import { useEffect, useState } from 'react';

export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const sync = () => setVisible(document.visibilityState === 'visible');
    sync();

    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return visible;
}
