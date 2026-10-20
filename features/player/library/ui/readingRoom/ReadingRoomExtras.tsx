// features/player/library/ui/readingRoom/ReadingRoomExtras.tsx — ce que la
// Grande salle de lecture ajoute SOUS la scène (lot 8 de
// docs/PLAN-womens-library.md). Monté dans l'emplacement « Lot 8 » de
// `ui/room/RoomExtras` ; ne rend RIEN hors de la salle de lecture.
//
// C'est le chemin COMPLET sans canvas, pour le clavier et les lecteurs
// d'écran, dans l'ordre :
//   1. la sortie rapide (`SafetyQuickExit` de /securite) : bouton fixe,
//      toujours visible, et Échap ×2 — `location.replace` vers une page
//      neutre, Retour ne ramène pas ici ;
//   2. l'arrivée discrète, expliquée calmement : personne ne la voit, ce que
//      change « Être visible » (le choix lui-même est le `DiscreetToggle` du
//      lot 5, près de la scène), le silence de la salle ;
//   3. les rayonnages : chacun ouvre son panneau de lecture (`ShelfDialog`) ;
//   4. le guichet (`ReadingRoomGuichet`) → /support pré-rempli.
// Un appui sur un rayonnage ou sur le guichet DANS LA VUE ouvre le même
// panneau (`readingRoom/hotspots`, `readingRoom/spotRequests`).
//
// RIEN À COMPTER, RIEN À ENVOYER : aucun compteur, aucune liste de présentes
// ici (seule « Présentes dans la salle » du lot 5 montre celles qui ont CHOISI
// d'être visibles), aucun appel réseau, aucun événement de mesure. Ouvrir un
// rayonnage ne se voit pas et ne se compte pas.

import { useEffect, useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsReadingRoom from '@/lib/i18n/locales/fr/playerLibraryReadingRoom';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import SafetyQuickExit from '@/components/safety/SafetyQuickExit';
import {
  type ReadingRoomSpotId,
  subscribeReadingRoomSpots,
} from '../../readingRoom/spotRequests';
import {
  helplineNumbers,
  READING_ROOM_SHELF_IDS,
  type ReadingRoomShelfId,
} from '../../readingRoom/shelves';
import type { LibraryRoomKind } from '../../socialResponses';
import { FOCUS_RING, TEXT_MUTED } from '../social/shared';
import ReadingDialog from './ReadingDialog';
import ReadingRoomGuichet from './ReadingRoomGuichet';
import ShelfDialog from './ShelfDialog';

export type ReadingRoomExtrasProps = {
  room: { kind: LibraryRoomKind };
  /** Injecté par les tests ; par défaut, `location.replace` (cf. quickExit). */
  onExit?: () => void;
};

const CARD =
  'flex h-full flex-col gap-2 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';

const SHELF_BUTTON = `w-fit min-h-11 rounded-[var(--r-ctrl,4px)] text-left text-base font-semibold text-[var(--t1,#f4edf7)] underline decoration-[var(--or,#b467d1)] underline-offset-4 hover:text-[var(--or-200,#eec4ff)] ${FOCUS_RING}`;

const H2 = 'text-lg font-bold text-[var(--t1,#f4edf7)]';

export default function ReadingRoomExtras({
  room,
  onExit,
}: ReadingRoomExtrasProps) {
  if (room.kind !== 'reading_room') return null;
  return <ReadingRoomPanel onExit={onExit} />;
}

function ReadingRoomPanel({ onExit }: { onExit?: () => void }) {
  const t = useT(nsReadingRoom);
  const ts = useT(nsSafetyPage);
  const ids = useId();
  const [open, setOpen] = useState<ReadingRoomSpotId | null>(null);

  // Un appui sur un point de la vue ouvre le même panneau.
  useEffect(() => subscribeReadingRoomSpots(setOpen), []);

  const titles: Record<ReadingRoomShelfId, string> = {
    helplines: ts.emergencyTitle,
    guides: ts.harassTitle,
    report: ts.reportTitle,
    charter: ts.charterTitle,
  };
  const summaryOf = (shelf: ReadingRoomShelfId) =>
    shelf === 'helplines'
      ? format(t.shelves.summaries.helplines, {
          numbers: helplineNumbers().join(' · '),
        })
      : t.shelves.summaries[shelf];
  const close = () => setOpen(null);
  const guichetDialogTitle = `${ids}-guichet-dialog`;

  return (
    <div className="flex flex-col gap-6" data-reading-room="">
      <SafetyQuickExit onExit={onExit} />

      <section
        aria-labelledby={`${ids}-welcome`}
        className={`${CARD} gap-3`}
        data-reading-welcome=""
      >
        <h2 id={`${ids}-welcome`} className={H2}>
          {t.welcome.title}
        </h2>
        <p className="text-sm text-[var(--t1,#f4edf7)]">{t.welcome.body}</p>
        <p className={TEXT_MUTED}>{t.welcome.visible}</p>
        <p className={TEXT_MUTED}>{t.welcome.silence}</p>
        <p className={TEXT_MUTED}>{t.welcome.noTrace}</p>
        <p className="text-xs text-[var(--t3,#a39ba6)]">
          {ts.quickExitHint} {ts.exitLimit}
        </p>
      </section>

      <section
        aria-labelledby={`${ids}-shelves`}
        className="flex flex-col gap-3"
      >
        <h2 id={`${ids}-shelves`} className={H2}>
          {t.shelves.title}
        </h2>
        <p className={TEXT_MUTED}>{t.shelves.intro}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {READING_ROOM_SHELF_IDS.map((shelf) => (
            <li key={shelf} className={CARD}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-describedby={`${ids}-${shelf}`}
                data-shelf={shelf}
                onClick={() => setOpen(shelf)}
                className={SHELF_BUTTON}
              >
                {titles[shelf]}
              </button>
              <p id={`${ids}-${shelf}`} className={TEXT_MUTED}>
                {summaryOf(shelf)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${ids}-guichet`} className={CARD}>
        <ReadingRoomGuichet headingId={`${ids}-guichet`} />
      </section>

      {open && open !== 'guichet' ? (
        <ShelfDialog key={open} shelf={open} onClose={close} />
      ) : null}
      {open === 'guichet' ? (
        <ReadingDialog
          labelledBy={guichetDialogTitle}
          panel="guichet"
          onClose={close}
        >
          <ReadingRoomGuichet headingId={guichetDialogTitle} />
        </ReadingDialog>
      ) : null}
    </div>
  );
}
