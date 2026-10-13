// utils/tcg/overlayPayload.ts — ce que la source OBS du TCG reçoit
// (`GET /api/overlay/tcg/[token]`, et `?with=tcg` de la boîte d'alertes).
//
// L'habillage voyage AVEC les annonces plutôt que par une seconde route : cela
// éviterait un point d'entrée anonyme de plus, et la source interroge déjà la
// route toutes les 5 secondes. Le thème est petit et se met en cache avec le
// reste.
//
// Il ne transite PAS par `overlayFeed.ts`, qui est la frontière de
// confidentialité : l'habillage ne porte aucune donnée personnelle, et l'y
// faire passer diluerait la seule raison d'être de ce module. D'où ce fichier
// à part, type seul.

import type { OverlayFeedItem } from './overlayFeed';
import type { OverlayTheme } from './overlayThemeShape';

export type TcgOverlayPayload = {
  items: OverlayFeedItem[];
  theme: OverlayTheme;
};
