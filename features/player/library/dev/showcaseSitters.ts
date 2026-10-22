// features/player/library/dev/showcaseSitters.ts — la géométrie de la vitrine
// du lot 15 (`./showcase.ts`, page `/dev/library-room`, 404 en production) :
// une joueuse par place de chaque meuble (ou devant ceux dont on se sert), à
// sa case d'accès. Chargé à la demande : le moteur reste hors de la page.

import { LIBRARY_FURNITURE } from '@/config/library/furniture';
import {
  furnitureSpots,
  interactionOf,
  serviceAccess,
  spotAccess,
} from '../engine/interactions';
import type { Direction } from '../engine/motion';
import type { Tile } from '../engine/projection';
import {
  buildWalkGrid,
  type FurnitureCatalog,
  type RoomItem,
  type Rotation,
} from '../engine/room';
import type { LibraryRest } from '../realtime/connection';
import type { LibraryApartmentItem } from '../responses';
import type { FakeRealtime } from './fakeRealtime';
import { type DevPresenceSigner, signedPeerMeta } from './presenceSigner';
import { devLook } from './simulatedPeers';

/** Le catalogue du moteur d'après celui des meubles (celui du manifeste). */
export const DEV_CATALOG: FurnitureCatalog = Object.fromEntries(
  LIBRARY_FURNITURE.map((f) => [
    f.key,
    {
      footprint: { ...f.footprint },
      height: f.heightM,
      ...(f.layer ? { layer: f.layer } : {}),
    },
  ])
);

type Sitter = { tile: Tile; dir: Direction; rest: LibraryRest };

/** Une joueuse par place (ou devant chaque meuble dont on se sert). */
export function showcaseSitters(
  width: number,
  depth: number,
  apartmentItems: readonly LibraryApartmentItem[]
): Sitter[] {
  const items: RoomItem[] = apartmentItems.map((i) => ({
    id: i.inventoryId,
    key: i.key,
    gx: i.gx,
    gy: i.gy,
    r: i.rotation as Rotation,
  }));
  const grid = buildWalkGrid(
    { w: width, d: depth, wallHeight: 2.6, items },
    DEV_CATALOG
  );
  const out: Sitter[] = [];
  for (const item of items) {
    const kind = interactionOf(item, DEV_CATALOG);
    if (kind === 'sit' || kind === 'lie') {
      for (const s of furnitureSpots(item, DEV_CATALOG)) {
        const tile = spotAccess(item, DEV_CATALOG, grid, s.index);
        if (tile)
          out.push({
            tile,
            dir: s.dir,
            rest: { seat: { item: item.id, spot: s.index } },
          });
      }
    } else if (kind) {
      const tile = serviceAccess(item, DEV_CATALOG, grid);
      if (tile) out.push({ tile, dir: 4, rest: { use: { item: item.id } } });
    }
  }
  return out;
}

const sitterId = (k: number) =>
  `00000000-0000-4000-8000-${(0x300 + k).toString(16).padStart(12, '0')}`;

/**
 * Les joueuses de la vitrine entrent, déjà installées (une sur deux
 * composée) ; rend de quoi les faire sortir.
 */
export function seatShowcaseSitters(
  bus: FakeRealtime,
  room: {
    id: string;
    topic: string;
    width: number;
    depth: number;
    items: readonly LibraryApartmentItem[];
  },
  signer: DevPresenceSigner
): () => void {
  const sitters = showcaseSitters(room.width, room.depth, room.items);
  let stopped = false;
  void Promise.all(
    sitters.map(async (s, k) => {
      const meta = await signedPeerMeta(signer, room.id, {
        userId: sitterId(k),
        nickname: String(k + 1),
        avatarId: `a${String((k % 12) + 1).padStart(2, '0')}`,
        ...(k % 2 ? { look: devLook(k) } : {}),
        gx: s.tile.i,
        gy: s.tile.j,
        dir: s.dir,
      });
      if (!stopped) bus.peerJoin(room.topic, { ...meta, ...s.rest });
    })
  );
  return () => {
    stopped = true;
    sitters.forEach((_, k) => bus.peerLeave(room.topic, sitterId(k)));
  };
}
