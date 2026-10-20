// features/player/library/ui/readingRoom/ShelfDialog.tsx — un rayonnage de la
// Grande salle de lecture, ouvert en panneau de lecture (lot 8 de
// docs/PLAN-womens-library.md).
//
// AUCUN TEXTE RECOPIÉ : le panneau rend la section de la page publique
// /securite qui porte le même contenu (`components/safety/**`, namespace
// `safetyPage`), et finit par un lien vers elle — nouvel onglet : la salle
// reste ouverte derrière.
//   helplines → SafetyHelplines (numéros : liens `tel:` / `sms:`) ;
//   guides    → SafetyHarassmentGuides ;
//   report    → SafetyReportSection (avec les boutons du guichet) ;
//   charter   → la section « La charte » de /securite (emplacement réservé).
// Le dialogue est nommé par le `h2` de la section (`shelfHeadingId`).

import Link from 'next/link';
import type { RefObject } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsReadingRoom from '@/lib/i18n/locales/fr/playerLibraryReadingRoom';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import SafetyHarassmentGuides from '@/components/safety/SafetyHarassmentGuides';
import SafetyHelplines from '@/components/safety/SafetyHelplines';
import SafetyReportSection from '@/components/safety/SafetyReportSection';
import SafetySection from '@/components/safety/SafetySection';
import {
  type ReadingRoomShelfId,
  SECURITE_ANCHORS,
  securiteHref,
  shelfHeadingId,
} from '../../readingRoom/shelves';
import { LINK } from '../social/shared';
import ReadingDialog from './ReadingDialog';

/** La section de /securite qui porte ce rayonnage. */
export function ShelfContent({ shelf }: { shelf: ReadingRoomShelfId }) {
  const ts = useT(nsSafetyPage);
  switch (shelf) {
    case 'helplines':
      return <SafetyHelplines />;
    case 'guides':
      return <SafetyHarassmentGuides />;
    case 'report':
      return <SafetyReportSection />;
    case 'charter':
      // Même section, mêmes mots que /securite (`pages/securite.tsx`).
      return (
        <SafetySection id={SECURITE_ANCHORS.charter} title={ts.charterTitle}>
          <p className="mt-4 text-base leading-relaxed text-gray-100">
            {ts.charterBody}
          </p>
        </SafetySection>
      );
  }
}

export default function ShelfDialog({
  shelf,
  onClose,
  returnFocusRef,
}: {
  shelf: ReadingRoomShelfId;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const t = useT(nsReadingRoom);
  return (
    <ReadingDialog
      labelledBy={shelfHeadingId(shelf)}
      panel={shelf}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <Link
          prefetch={false}
          href={securiteHref(shelf)}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          {t.shelves.readOnPage}
          <span className="sr-only"> {t.shelves.newTab}</span>
        </Link>
      }
    >
      <ShelfContent shelf={shelf} />
    </ReadingDialog>
  );
}
