// features/player/library/ui/room/RoomExtras.tsx — ce qu'une salle ajoute
// SOUS la scène, selon son type (docs/PLAN-womens-library.md, lots 6 à 9).
//
// UN EMPLACEMENT PAR LOT, et un seul propriétaire par emplacement : chaque lot
// remplace SA ligne réservée par son composant (un import, une ligne), sans
// toucher aux autres. Les lots avancent en parallèle : ne rien réordonner ici.

import type { LibraryRoomView } from '../../socialResponses';
import LibraryChat from '../chat/LibraryChat';
import HallExtras from '../hall/HallExtras';
import ReadingRoomExtras from '../readingRoom/ReadingRoomExtras';
import TeamHqPanel from '../teamHq/TeamHqPanel';

export default function RoomExtras({ room }: { room: LibraryRoomView }) {
  return (
    <div className="mt-6 grid gap-6" data-room-kind={room.kind}>
      {/* Lot 6 — chat interne : fil de la salle et saisie (pas en reading_room). */}
      <LibraryChat roomId={room.id} kind={room.kind} />
      {/* Lot 7 — hall : panneau d'annonces, portes vers les autres lieux. */}
      <HallExtras room={room} />
      {/* Lot 8 — Grande salle de lecture : rayonnages, guichet, sortie rapide. */}
      <ReadingRoomExtras room={room} />
      {/* Lot 9 — QG d'équipe : prochain match, porte vers le salon Discord. */}
      <TeamHqPanel room={room} />
    </div>
  );
}
