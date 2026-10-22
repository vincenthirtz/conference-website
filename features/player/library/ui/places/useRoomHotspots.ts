// features/player/library/ui/places/useRoomHotspots.ts — les ZONES d'une
// salle (engine/hotspots.ts) et où va leur appui, par sorte de salle (lot 7
// de docs/PLAN-womens-library.md). `RoomStage` les donne au moteur ; chaque
// lot garde ses panneaux chez lui et ne reçoit que les appuis sur SES zones :
//   - `hall` (lot 7)         : panneau d'annonces, tableau du tournoi et
//                              trois portes (`layouts/hall.ts`), plus les
//                              zones d'une saison (lot 16 : la citrouille de
//                              l'Event Halloween, `halloween/hallDecor.ts`) →
//                              `requestHallSpot` ;
//   - `reading_room` (lot 8) : rayonnages et guichet (`readingRoom/hotspots`)
//                              → `requestReadingRoomSpot` ; la porte du hall
//                              (lot 7) → le hall ;
//   - `team_hq` (lot 9)      : RÉSERVÉ — ajouter ici un `case` qui rend les
//                              zones du QG et leur routage.
// Les noms (infobulles) sont traduits ici : le moteur n'a pas d'i18n.

import Router from 'next/router';
import { useMemo } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import type {
  HotspotDecl,
  HotspotTap,
  LibraryHotspot,
} from '../../engine/hotspots';
import { requestHallSpot } from '../../hall/spotRequests';
import { HALL_HOTSPOTS, type HallSpotId } from '../../layouts/hall';
import { READING_HALL_DOOR } from '../../layouts/readingRoom';
import { readingRoomHotspots } from '../../readingRoom/hotspots';
import {
  type ReadingRoomSpotId,
  requestReadingRoomSpot,
} from '../../readingRoom/spotRequests';
import { placeHref } from '../../roomStageModel';
import type { LibraryRoomKind } from '../../socialResponses';

type SpotLabels = Readonly<Record<string, string>>;

export type RoomHotspots = {
  hotspots: readonly LibraryHotspot[];
  onHotspotTap: (tap: HotspotTap) => void;
};

/**
 * Les zones qu'une SAISON ajoute (lot 16, `halloween/hallDecor.hallSeasonAt`)
 * et, sans écran pour les ouvrir, la page où elles mènent.
 */
export type SeasonSpots = {
  hotspots: readonly HotspotDecl[];
  hrefOf?: (spotId: string) => string | null;
};

const NONE: RoomHotspots = { hotspots: [], onHotspotTap: () => {} };

function named(
  decls: readonly HotspotDecl[],
  labels: SpotLabels
): LibraryHotspot[] {
  return decls.map((d) => ({
    id: d.id,
    label: labels[d.labelKey],
    shape: d.shape,
  }));
}

/** Les zones de la Grande salle de lecture : celles du lot 8, puis la porte du hall. */
function readingRoomSpots(labels: SpotLabels): LibraryHotspot[] {
  const lot8: LibraryHotspot[] = readingRoomHotspots().map((s) => ({
    id: s.id,
    label: s.id === 'guichet' ? labels.guichet : labels.shelf,
    shape: { kind: 'area', area: s.area },
  }));
  return [...lot8, ...named([READING_HALL_DOOR], labels)];
}

/**
 * Les zones d'une sorte de salle et le routage de leurs appuis.
 * `navigate` : changer de lieu (défaut `Router.push`, lu à l'appui seulement).
 * `season` (lot 16) : les zones de saison du hall (la citrouille pendant
 * l'Event Halloween), posées avec les meubles qu'elles couvrent.
 */
export function roomHotspotsOf(
  kind: LibraryRoomKind | null,
  labels: SpotLabels,
  navigate: (href: string) => void = (href) => void Router.push(href),
  season: SeasonSpots | null = null
): RoomHotspots {
  switch (kind) {
    case 'hall':
      return {
        hotspots: named(
          season ? [...HALL_HOTSPOTS, ...season.hotspots] : HALL_HOTSPOTS,
          labels
        ),
        onHotspotTap: ({ id }) => {
          // L'écran du hall ouvre le panneau ; sans lui, une porte mène quand
          // même, et une zone de saison à sa page.
          if (requestHallSpot(id as HallSpotId)) return;
          if (id === 'reading_room') navigate(placeHref('reading_room'));
          // Lot 12 de docs/PLAN-tcg-2.md — la porte de l'arène.
          if (id === 'arena') navigate(placeHref('arena'));
          const href = season?.hrefOf?.(id);
          if (href) navigate(href);
        },
      };
    case 'reading_room':
      return {
        hotspots: readingRoomSpots(labels),
        onHotspotTap: ({ id }) => {
          if (id === READING_HALL_DOOR.id) navigate(placeHref('hall'));
          else requestReadingRoomSpot(id as ReadingRoomSpotId);
        },
      };
    // case 'team_hq': — Lot 9 — QG : ses zones (panneaux) et leur routage.
    default:
      return NONE;
  }
}

/**
 * Les zones de la salle où l'on est, traduites, stables tant que rien ne
 * change. `season` : voir `roomHotspotsOf`.
 */
export function useRoomHotspots(
  kind: LibraryRoomKind | null,
  navigate?: (href: string) => void,
  season: SeasonSpots | null = null
): RoomHotspots {
  const t = useT(nsHall);
  return useMemo(
    () => roomHotspotsOf(kind, t.spots, navigate, season),
    [kind, t.spots, navigate, season]
  );
}
