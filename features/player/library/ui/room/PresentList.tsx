// features/player/library/ui/room/PresentList.tsx — « Présentes dans la
// salle » (lot 5 phase B) : les autres joueuses VISIBLES, en boutons hors du
// canvas. C'est l'accès au clavier et au lecteur d'écran aux avatars : chaque
// pseudo ouvre le MÊME menu qu'un appui dans la vue (bloquer, signaler,
// expulser chez soi). Jamais soi-même, jamais une personne masquée : la liste
// est celle du temps réel (`useLibraryRoomChannel().avatars`).

import { useId } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import type { RemoteAvatar } from '../../realtime/roomState';
import { FOCUS_RING } from '../social/shared';

const NAME = `inline-flex min-h-11 max-w-[14rem] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-sm font-semibold text-[var(--t1,#f4edf7)] hover:border-[var(--or,#b467d1)] aria-expanded:border-[var(--or,#b467d1)] ${FOCUS_RING}`;

export default function PresentList({
  avatars,
  openFor,
  onOpen,
}: {
  avatars: readonly RemoteAvatar[];
  /** La joueuse dont le menu est ouvert (null : aucun). */
  openFor: string | null;
  onOpen: (avatar: RemoteAvatar, trigger: HTMLElement) => void;
}) {
  const t = useT(nsSocial);
  const ids = useId();
  const count = avatars.length;

  return (
    <section
      aria-labelledby={`${ids}-title`}
      data-library-present=""
      className="flex flex-col gap-2"
    >
      <h3
        id={`${ids}-title`}
        className="text-sm font-semibold text-[var(--t2,#c7bfca)]"
      >
        {t.room.presentTitle}
      </h3>
      {count === 0 ? (
        <p className="text-sm text-[var(--t3,#a39ba6)]">
          {t.room.presentEmpty}
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--t3,#a39ba6)]">
            {format(
              count === 1 ? t.room.presentCount_one : t.room.presentCount_other,
              { count }
            )}
          </p>
          <p id={`${ids}-hint`} className="sr-only">
            {t.room.presentHint}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {avatars.map((a) => (
              <li key={a.userId}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openFor === a.userId}
                  aria-describedby={`${ids}-hint`}
                  data-user-id={a.userId}
                  onClick={(e) => onOpen(a, e.currentTarget)}
                  className={NAME}
                >
                  <span className="truncate">{a.nickname}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
