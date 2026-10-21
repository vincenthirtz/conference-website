// features/player/library/ui/hall/HalloweenHall.tsx — l'Event Halloween dans
// le hall (lot 16 de docs/PLAN-womens-library.md), côté écran :
//   - l'ENTRÉE sous la scène, pour le clavier et les lecteurs d'écran (la
//     citrouille et le fantôme ne sont que dans le canvas) ;
//   - le DIALOGUE du hall (`PlaceDialog`), titré « Bouh ! », qui charge à son
//     ouverture l'inscription en un clic (`HalloweenSignupPanel`,
//     `next/dynamic` : le client du tableau de bord ne part qu'alors).
// Les trois chemins (citrouille, fantôme, entrée) ouvrent ce même dialogue,
// par `HallExtras`, qui charge ce module à la demande (`next/dynamic`) dans le
// hall ; il ne montre rien hors de l'événement (`halloween/event.ts`, lu à
// l'entrée). Rien de tout cela dans le premier chargement de /player/library
// (scripts/bundle-budget.mjs).
//
// Le petit fantôme du titre ne flotte que si la joueuse accepte les
// animations (`motion-safe:`, `prefers-reduced-motion`).

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import nsHalloween from '@/lib/i18n/locales/fr/playerLibraryHalloween';
import { Button } from '@/features/ruban';
import { formatSiteDate } from '@/utils/timezone';
import { type HalloweenEvent, halloweenEventAt } from '../../halloween/event';
import PlaceDialog from '../places/PlaceDialog';
import { TEXT_MUTED } from '../social/shared';

const HalloweenSignupPanel = dynamic(() => import('./HalloweenSignupPanel'), {
  ssr: false,
  loading: () => <HalloweenOpening />,
});

function HalloweenOpening() {
  const t = useT(nsHalloween);
  return (
    <p role="status" className={TEXT_MUTED}>
      {t.opening}
    </p>
  );
}

export type HalloweenHallProps = {
  /** L'instant de l'entrée dans le hall (ms) : l'événement est-il à l'affiche ? */
  enteredAt: number;
  /** Le dialogue est demandé (citrouille, fantôme ou entrée). */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** L'id du titre du dialogue. */
  headingId: string;
};

/** Rien hors de l'événement ; pendant, l'entrée et (sur demande) le dialogue. */
export default function HalloweenHall({
  enteredAt,
  ...props
}: HalloweenHallProps) {
  const [event] = useState(() => halloweenEventAt(enteredAt));
  return event ? <HalloweenEntryAndDialog event={event} {...props} /> : null;
}

function HalloweenEntryAndDialog({
  event,
  open,
  onOpen,
  onClose,
  headingId,
}: Omit<HalloweenHallProps, 'enteredAt'> & { event: HalloweenEvent }) {
  const t = useT(nsHalloween);
  const tHall = useT(nsHall).halloween;
  const { lang } = useLang();
  const date = formatSiteDate(event.date, lang, {
    day: 'numeric',
    month: 'long',
  });
  return (
    <>
      <section
        aria-labelledby="library-hall-halloween-title"
        className="flex flex-col gap-3 rounded-[var(--r-card,14px)] border border-[#f0a238]/40 p-4 md:col-span-2"
        data-hall-halloween=""
      >
        <h2
          id="library-hall-halloween-title"
          className="text-lg font-bold text-[var(--t1,#f4edf7)]"
        >
          <span aria-hidden="true">🎃 </span>
          {t.entryTitle}
        </h2>
        <p className={TEXT_MUTED}>{format(t.entryIntro, { date })}</p>
        <Button
          size="sm"
          variant="primary"
          className="w-fit"
          aria-haspopup="dialog"
          onClick={onOpen}
        >
          {t.entryOpen}
        </Button>
      </section>
      {open && (
        <PlaceDialog labelledBy={headingId} panel="halloween" onClose={onClose}>
          <div className="flex flex-col gap-3">
            <h2
              id={headingId}
              tabIndex={-1}
              className="flex items-center gap-2 text-2xl font-bold text-[var(--t1,#f4edf7)] outline-none"
            >
              <span
                aria-hidden="true"
                className="inline-block motion-safe:animate-bounce"
              >
                👻
              </span>
              {tHall.boo}
            </h2>
            <HalloweenSignupPanel event={event} />
          </div>
        </PlaceDialog>
      )}
    </>
  );
}
