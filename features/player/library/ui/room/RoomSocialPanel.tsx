// features/player/library/ui/room/RoomSocialPanel.tsx — sous la scène d'une
// salle (lot 5 phase B) : le mode discret (Grande salle de lecture seulement,
// le composant ne rend rien ailleurs), la barre des signes et la liste des
// présentes. Présentationnel : tout vient du canal et de `useRoomSocial`.

import type { LibraryRoomChannel } from '../../realtime/useLibraryRoomChannel';
import type { LibraryRoomKind } from '../../socialResponses';
import { emoteBarDisabledReason } from '../../socialModel';
import DiscreetToggle from '../social/DiscreetToggle';
import EmoteBar from '../social/EmoteBar';
import PresentList from './PresentList';
import type { RoomSocial } from './useRoomSocial';

export default function RoomSocialPanel({
  room,
  social,
  kind,
}: {
  room: LibraryRoomChannel;
  social: RoomSocial;
  kind: LibraryRoomKind;
}) {
  const canBeVisible = room.enter?.canBeVisible ?? true;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <DiscreetToggle
          roomKind={kind}
          visible={room.visible}
          canBeVisible={canBeVisible}
          onChange={room.setVisible}
        />
        <EmoteBar
          roomKind={kind}
          disabledReason={emoteBarDisabledReason({
            phase: room.phase,
            visible: room.visible,
            kind,
            canBeVisible,
          })}
          onEmote={social.sendEmote}
          onPhrase={social.sendPhrase}
        />
      </div>
      <PresentList
        avatars={room.avatars}
        openFor={social.menu?.target.userId ?? null}
        onOpen={social.openFromList}
      />
    </div>
  );
}
