// features/player/library/halloween/hallDecor.ts — LA CITROUILLE du hall
// pendant l'événement d'Halloween (lot 16 de docs/PLAN-womens-library.md).
//
// Un CALQUE DE SAISON posé sur le décor fixe du hall (`layouts/hall.ts`), pas
// une ligne de plus dans le décor : tant que l'événement est à l'affiche
// (`./event.ts`), `hallSeasonAt` rend une pile de citrouilles et une
// citrouille-lanterne près de l'entrée, et la zone déclarée `halloween` qui
// les couvre (un appui ouvre l'inscription en un clic, `ui/hall/HalloweenHall`,
// comme le panneau d'annonces ouvre les annonces) ; après `visibleUntil`, rien :
// le hall redevient comme avant, sans que personne n'y pense.
//
// CHARGÉ À LA DEMANDE, à l'entrée dans le hall (`ui/hall/useHallSeason`) : ni
// ce module, ni l'encart de l'événement (`config/homeEventSpotlight`) n'entrent
// dans le premier chargement des pages de la Library. L'écran pose les
// citrouilles (`roomStageModel.sceneOf`) et leur zone (`useRoomHotspots`) à
// partir du MÊME résultat : la zone n'existe jamais sans la citrouille.
//
// Place : juste devant la porte d'entrée, sous l'arrivée à l'écran
// (`HALL_PLAYER_START`), entre la plante de l'entrée et le salon : rien de
// haut n'est dessiné devant elles, et le chemin qui part de la porte vers la
// salle reste libre. Cases libres du hall (test :
// tests/unit/libraryHalloween.test.ts, `layoutIssues` propre, rien enfermé).

import type { HotspotDecl } from '../engine/hotspots';
import type { RoomItem } from '../engine/room';
import type { HallSpotId } from '../layouts/hall';
import {
  type HalloweenEvent,
  halloweenEventAt,
  halloweenSignupHref,
} from './event';

/** La pile de citrouilles (2 × 2 cases) et la citrouille-lanterne (1 × 1). */
export const HALLOWEEN_HALL_ITEMS: readonly RoomItem[] = [
  { id: 'halloween-pumpkins', key: 'pumpkin_pile', gx: 2, gy: 13, r: 0 },
  { id: 'halloween-lantern', key: 'jack_o_lantern', gx: 4, gy: 14, r: 0 },
];

/**
 * La zone `halloween` : un pavé sur les deux citrouilles (bornes max
 * exclues), plus haut qu'elles (0,6 m) pour se viser au doigt — la lanterne
 * seule ne fait que 45 px de large à l'écran.
 */
export const HALLOWEEN_HOTSPOT: HotspotDecl & { id: HallSpotId } = {
  id: 'halloween',
  labelKey: 'halloween',
  shape: {
    kind: 'area',
    area: { minX: 2, minY: 13, maxX: 5, maxY: 15 },
    heightM: 0.6,
  },
};

/** Ce que la saison ajoute au hall : ses meubles, ses zones, où mènent-elles. */
export type HallSeason = {
  event: HalloweenEvent;
  items: readonly RoomItem[];
  hotspots: readonly HotspotDecl[];
  /** Sans écran du hall pour l'ouvrir, la page où mène une zone de saison. */
  hrefOf: (spotId: string) => string | null;
};

/** La saison du hall à `nowMs` (l'entrée), ou null hors de l'événement. */
export function hallSeasonAt(nowMs: number): HallSeason | null {
  const event = halloweenEventAt(nowMs);
  if (!event) return null;
  const href = halloweenSignupHref(event);
  return {
    event,
    items: HALLOWEEN_HALL_ITEMS,
    hotspots: [HALLOWEEN_HOTSPOT],
    hrefOf: (spotId) => (spotId === HALLOWEEN_HOTSPOT.id ? href : null),
  };
}
