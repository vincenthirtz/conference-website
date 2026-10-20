// features/player/library/ui/places/PlacesNav.tsx — la navigation « Lieux »
// de la Women's Library (lot 7 de docs/PLAN-womens-library.md) : Mon
// appartement · Hall · Grande salle de lecture · QG de mon équipe.
//
// Les lieux communs s'ouvrent par `?place=` (la salle est trouvée, ou créée,
// par l'API) ; le lieu où l'on est porte `aria-current="page"`. Le QG (lot 9)
// n'a pas d'adresse fixe : son entrée ouvre la porte des QG de mes équipes
// (`TeamHqDoor`) dans un dialogue.
//
// À poser une fois la porte de la Library franchie (sinon chaque lieu
// montrerait la même porte).

import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { placeHref } from '../../roomStageModel';
import type { LibraryRoomKind } from '../../socialResponses';
import { FOCUS_RING } from '../social/shared';
import TeamHqDoor from '../teamHq/TeamHqDoor';
import PlaceDialog from './PlaceDialog';

export type PlaceId = 'apartment' | 'hall' | 'reading_room' | 'team_hq';

const APARTMENT_HREF = '/player/library';

/** Le lieu d'une salle où l'on est (l'appartement d'une autre : aucun). */
export function placeOfKind(kind: LibraryRoomKind): PlaceId | null {
  return kind === 'apartment' ? null : kind;
}

const ITEM = `inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-semibold transition-colors ${FOCUS_RING}`;
const IDLE =
  'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:text-[var(--t1,#f4edf7)]';
const CURRENT =
  'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.15)] text-[var(--t1,#f4edf7)]';

export default function PlacesNav({ current }: { current: PlaceId | null }) {
  const t = useT(nsHall);
  const [teamHqOpen, setTeamHqOpen] = useState(false);
  const links: { id: PlaceId; href: string; label: string }[] = [
    { id: 'apartment', href: APARTMENT_HREF, label: t.places.apartment },
    { id: 'hall', href: placeHref('hall'), label: t.places.hall },
    {
      id: 'reading_room',
      href: placeHref('reading_room'),
      label: t.places.readingRoom,
    },
  ];
  const cls = (id: PlaceId) => `${ITEM} ${id === current ? CURRENT : IDLE}`;

  return (
    <nav aria-label={t.places.navLabel} className="mb-6" data-library-places="">
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              prefetch={false}
              href={link.href}
              aria-current={link.id === current ? 'page' : undefined}
              className={cls(link.id)}
            >
              {link.label}
            </Link>
          </li>
        ))}
        {/* Lot 9 — QG : la porte des QG de mes équipes (`TeamHqDoor`). */}
        <li>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-current={current === 'team_hq' ? 'page' : undefined}
            onClick={() => setTeamHqOpen(true)}
            className={cls('team_hq')}
          >
            {t.places.teamHq}
          </button>
        </li>
      </ul>
      {teamHqOpen && (
        <PlaceDialog
          labelledBy="team-hq-door-title"
          panel="team_hq"
          onClose={() => setTeamHqOpen(false)}
        >
          <TeamHqDoor headingLevel={2} />
        </PlaceDialog>
      )}
    </nav>
  );
}
