// Les décors FIXES de la Women's Library :
//   - les salles de la démo /dev/library-spike (?room=demo|hall|reading) ;
//   - les SALLES COMMUNES vivantes (lot 7) : quand on entre dans le hall ou la
//     Grande salle de lecture, `POST enter` ne rend aucun meuble — la scène
//     prend le décor et les meubles d'ici (`fixedLayoutOf`, lu par
//     `roomStageModel.sceneOf`). Une salle commune de plus = une entrée dans
//     `FIXED_ROOM_LAYOUTS`, rien d'autre à brancher.

import { DEMO_BOT_COUNT, DEMO_PLAYER_START, DEMO_ROOM } from '../demoRoom';
import type { Tile } from '../engine/projection';
import type { RoomModel } from '../engine/room';
import type { LibraryRoomKind } from '../socialResponses';
import { HALL_PLAYER_START, HALL_ROOM } from './hall';
import { READING_PLAYER_START, READING_ROOM } from './readingRoom';

export type LayoutId = 'demo' | 'hall' | 'reading';

export type LibraryLayout = {
  room: RoomModel;
  playerStart: Tile;
  /** Bots de la mesure « 30 avatars » (la joueuse compte pour 1). */
  botCount: number;
};

export const LIBRARY_LAYOUTS: Record<LayoutId, LibraryLayout> = {
  demo: {
    room: DEMO_ROOM,
    playerStart: DEMO_PLAYER_START,
    botCount: DEMO_BOT_COUNT,
  },
  hall: {
    room: HALL_ROOM,
    playerStart: HALL_PLAYER_START,
    botCount: DEMO_BOT_COUNT,
  },
  reading: {
    room: READING_ROOM,
    playerStart: READING_PLAYER_START,
    botCount: DEMO_BOT_COUNT,
  },
};

/** Identifiant de salle lu dans l'URL ; toute autre valeur donne `demo`. */
export function layoutIdOf(value: unknown): LayoutId {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'hall' || v === 'reading' ? v : 'demo';
}

/** Le décor fixe d'une salle commune : la salle du moteur et l'arrivée. */
export type FixedRoomLayout = { room: RoomModel; playerStart: Tile };

export const FIXED_ROOM_LAYOUTS: Partial<
  Record<LibraryRoomKind, FixedRoomLayout>
> = {
  hall: { room: HALL_ROOM, playerStart: HALL_PLAYER_START },
  reading_room: { room: READING_ROOM, playerStart: READING_PLAYER_START },
};

/** Le décor fixe d'une sorte de salle, ou null (appartement, QG : meublés). */
export function fixedLayoutOf(kind: LibraryRoomKind): FixedRoomLayout | null {
  return FIXED_ROOM_LAYOUTS[kind] ?? null;
}
