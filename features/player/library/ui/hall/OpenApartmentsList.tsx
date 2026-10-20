// features/player/library/ui/hall/OpenApartmentsList.tsx — derrière la porte
// « Appartements » du hall (lot 7 de docs/PLAN-womens-library.md) : les
// appartements ouverts dont la propriétaire a choisi d'apparaître ici.
//
// Ni qui s'y trouve, ni combien : le nom de la salle et le pseudo de sa
// propriétaire, et « Entrer » (`/player/library?room=<id>`). L'API retire
// déjà le mien, ceux d'une personne bloquée (dans un sens ou dans l'autre) et
// ceux dont je suis expulsée. Par pages : « Afficher plus ».

import Link from 'next/link';
import type { ReactNode } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button } from '@/features/ruban';
import { useOpenRooms } from '../../hall/useHall';
import { LINK, TEXT_ERROR, TEXT_MUTED } from '../social/shared';

/** L'adresse d'une salle à visiter (l'écran `RoomScreen`). */
export function roomHref(roomId: string): string {
  return `/player/library?room=${encodeURIComponent(roomId)}`;
}

export default function OpenApartmentsList({
  headingId,
}: {
  headingId: string;
}) {
  const t = useT(nsHall);
  const query = useOpenRooms();

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <p role="status" className={TEXT_MUTED}>
        {t.apartments.loading}
      </p>
    );
  } else if (query.isError && !query.data) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className={TEXT_ERROR}>{t.apartments.error}</p>
        <Button size="sm" onClick={() => void query.refetch()}>
          {t.apartments.retry}
        </Button>
      </div>
    );
  } else {
    const rooms = query.data?.pages.flatMap((p) => p.rooms) ?? [];
    body = (
      <>
        {rooms.length === 0 ? (
          <p className={TEXT_MUTED}>{t.apartments.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-open-rooms="">
            {rooms.map((room) => {
              const name =
                room.name ??
                format(t.apartments.defaultName, {
                  nickname: room.ownerNickname,
                });
              return (
                <li
                  key={room.roomId}
                  data-room-id={room.roomId}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-[var(--t1,#f4edf7)]">
                      {name}
                    </span>
                    <span className="text-xs text-[var(--t3,#a39ba6)]">
                      {format(t.apartments.owner, {
                        nickname: room.ownerNickname,
                      })}
                    </span>
                  </span>
                  <Link
                    prefetch={false}
                    href={roomHref(room.roomId)}
                    aria-label={format(t.apartments.visitAria, { name })}
                    className={LINK}
                  >
                    {t.apartments.visit}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {query.isError && (
          <p role="alert" className={TEXT_ERROR}>
            {t.apartments.error}
          </p>
        )}
        {query.hasNextPage && (
          <Button
            size="sm"
            variant="secondary"
            className="w-fit"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage
              ? t.apartments.loadingMore
              : t.apartments.more}
          </Button>
        )}
      </>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={headingId}
      data-open-apartments=""
    >
      <h2 id={headingId} className="text-lg font-bold text-[var(--t1,#f4edf7)]">
        {t.apartments.title}
      </h2>
      <p className={TEXT_MUTED}>{t.apartments.intro}</p>
      {body}
    </section>
  );
}
