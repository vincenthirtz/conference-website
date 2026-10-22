// features/player/library/dev/devHalloween.tsx — sous la scène du hall de la
// page de développement `/dev/library-room` (lot 16 de
// docs/PLAN-womens-library.md), l'écran RÉEL du hall (`ui/hall/HallExtras` :
// l'entrée et le dialogue « Bouh ! »), branché sur des clients du hall et des
// QG EN MÉMOIRE. Un appui sur le fantôme ou la citrouille l'ouvre. L'instant
// de la saison vient de `DevRoomHarness` (`?npc=halloween`).
//
// Chargé à la demande par `DevRoomHarness` (le hall et ses panneaux ne pèsent
// pas sur le premier chargement de la page). L'inscription elle-même ne lit
// rien sans session : le dialogue renvoie alors vers la page d'inscription
// (aucun réseau).

import { SessionProvider } from '@/hooks/useSession';
import type { HallClient } from '../hall/client';
import { HallClientProvider } from '../hall/clientContext';
import type { TeamHqClient } from '../teamHq/client';
import { TeamHqClientProvider } from '../teamHq/clientContext';
import HallExtras from '../ui/hall/HallExtras';
import { FAKE_ROOM_ID } from './fakeRealtime';

const fakeHall: HallClient = {
  commonRoom: async (kind) => ({ roomId: FAKE_ROOM_ID, kind }),
  announcements: async () => ({ announcements: [] }),
  openRooms: async () => ({ rooms: [], nextCursor: null }),
};

const fakeTeamHq = {
  list: async () => ({ teams: [], lentInventoryIds: [] }),
} as unknown as TeamHqClient;

/**
 * L'écran du hall sous la scène, sans réseau. Les pages `/dev/*` sont nues
 * (pas de session dans `_app`) : on remet la session ici, sinon l'inscription
 * attendrait une session qui ne se lit jamais.
 */
export default function DevHallExtras({ seasonAt }: { seasonAt?: number }) {
  return (
    <SessionProvider>
      <HallClientProvider client={fakeHall}>
        <TeamHqClientProvider client={fakeTeamHq}>
          <HallExtras
            room={{ kind: 'hall' }}
            nowMs={seasonAt}
            navigate={(href) => console.info('[dev] navigate', href)}
          />
        </TeamHqClientProvider>
      </HallClientProvider>
    </SessionProvider>
  );
}
