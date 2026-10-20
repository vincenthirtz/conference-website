// features/player/library/ui/room/RoomOverlays.tsx — le menu d'un avatar et
// le signalement, branchés sur `useRoomSocial` (lot 5 phase B). Le menu se
// rend DANS le cadre positionné de la scène (son ancre y est calculée) ; à
// partir de `sm` il est posé près de l'avatar, en dessous c'est une feuille en
// bas de l'écran. Le signalement est un dialogue modal (portail).

import AvatarContextMenu from '../social/AvatarContextMenu';
import ReportDialog from '../social/ReportDialog';
import type { LibraryRoomView } from '../../socialResponses';
import type { RoomSocial } from './useRoomSocial';

export default function RoomOverlays({
  social,
  room,
}: {
  social: RoomSocial;
  room: Pick<LibraryRoomView, 'id' | 'kind' | 'isOwner'>;
}) {
  const { menu, report } = social;
  return (
    <>
      {menu && (
        <AvatarContextMenu
          key={menu.target.userId}
          target={menu.target}
          room={room}
          anchor={menu.anchor}
          onBlock={social.actions.block}
          onKick={social.actions.kick}
          onReport={social.openReport}
          onClose={social.closeMenu}
          returnFocusRef={menu.returnFocusRef}
        />
      )}
      {report && (
        <ReportDialog
          target={report.target}
          roomId={room.id}
          onSubmit={social.actions.report}
          onClose={social.closeReport}
          returnFocusRef={report.returnFocusRef}
        />
      )}
    </>
  );
}
