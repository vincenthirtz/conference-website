// Salles disponibles dans la démo /dev/library-spike (?room=demo|hall|reading).

import { DEMO_BOT_COUNT, DEMO_PLAYER_START, DEMO_ROOM } from '../demoRoom';
import type { Tile } from '../engine/projection';
import type { RoomModel } from '../engine/room';
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
