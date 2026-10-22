// features/player/library/ui/hall/HallDoors.tsx — les portes du hall (lot 7
// de docs/PLAN-womens-library.md), sans le canvas : chacune est aussi une
// zone de la vue (`layouts/hall.ts`, même `id`).
//
// POINT D'EXTENSION : `HALL_DOOR_LIST`. Une porte mène à un LIEU (`place`,
// `?place=`) ou ouvre un PANNEAU du hall (`panel`, rendu par `HallExtras`).
// La porte « QG de mon équipe » est celle du lot 9 : son panneau est
// `TeamHqDoor` (`ui/teamHq`). Une porte de plus = une entrée ici, une zone
// dans `HALL_HOTSPOTS` (même `id`) et ses textes dans `playerLibraryHall`.
//
// La porte de la Grande salle de lecture ne dit JAMAIS combien de personnes
// s'y trouvent (« aucune trace de qui la fréquente », plan section 4).

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button } from '@/features/ruban';
import type { HallSpotId } from '../../layouts/hall';
import { type LibraryDestination, placeHref } from '../../roomStageModel';
import { LINK, TEXT_MUTED } from '../social/shared';

/**
 * Les panneaux que le hall ouvre en dialogue : deux panneaux muraux (annonces,
 * tournoi en cours), ceux de deux portes et, pendant l'événement d'Halloween,
 * l'inscription en un clic (lot 16, la citrouille et le fantôme).
 */
export type HallPanel =
  | 'board'
  | 'tournament'
  | 'apartments'
  | 'team_hq'
  | 'halloween';

export type HallDoorAction =
  | { kind: 'place'; place: LibraryDestination }
  | {
      kind: 'panel';
      panel: Exclude<HallPanel, 'board' | 'tournament' | 'halloween'>;
    };

type DoorText = 'readingRoom' | 'apartments' | 'teamHq' | 'arena';

export type HallDoor = {
  id: Exclude<HallSpotId, 'board' | 'tournament_board' | 'halloween'>;
  /** Clés de `playerLibraryHall.doors` : `<text>` et `<text>Hint`. */
  text: DoorText;
  action: HallDoorAction;
};

export const HALL_DOOR_LIST: readonly HallDoor[] = [
  {
    id: 'reading_room',
    text: 'readingRoom',
    action: { kind: 'place', place: 'reading_room' },
  },
  {
    id: 'apartments',
    text: 'apartments',
    action: { kind: 'panel', panel: 'apartments' },
  },
  // Lot 9 — QG : la porte des QG d'équipe (panneau `TeamHqDoor`).
  {
    id: 'team_hq',
    text: 'teamHq',
    action: { kind: 'panel', panel: 'team_hq' },
  },
  // Lot 12 de docs/PLAN-tcg-2.md — l'arène : un lieu sans salle (`?place=arena`).
  {
    id: 'arena',
    text: 'arena',
    action: { kind: 'place', place: 'arena' },
  },
];

export function hallDoorOf(id: string): HallDoor | null {
  return HALL_DOOR_LIST.find((d) => d.id === id) ?? null;
}

export default function HallDoors({
  onOpen,
}: {
  onOpen: (panel: HallDoorAction & { kind: 'panel' }) => void;
}) {
  const t = useT(nsHall);
  return (
    <section
      aria-labelledby="library-hall-doors-title"
      className="flex flex-col gap-3"
      data-hall-doors=""
    >
      <h2
        id="library-hall-doors-title"
        className="text-lg font-bold text-[var(--t1,#f4edf7)]"
      >
        {t.doors.title}
      </h2>
      <ul className="flex flex-col gap-3">
        {HALL_DOOR_LIST.map((door) => {
          const { action } = door;
          return (
            <li
              key={door.id}
              data-hall-door={door.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] p-3"
            >
              <span className="flex flex-col">
                <span className="font-semibold text-[var(--t1,#f4edf7)]">
                  {t.doors[door.text]}
                </span>
                <span className={TEXT_MUTED}>
                  {t.doors[`${door.text}Hint`]}
                </span>
              </span>
              {action.kind === 'place' ? (
                <Link
                  prefetch={false}
                  href={placeHref(action.place)}
                  className={LINK}
                >
                  {t.doors.enter}
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-haspopup="dialog"
                  onClick={() => onOpen(action)}
                >
                  {action.panel === 'team_hq'
                    ? t.doors.openTeamHq
                    : t.doors.open}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
