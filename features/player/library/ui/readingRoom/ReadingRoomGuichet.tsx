// features/player/library/ui/readingRoom/ReadingRoomGuichet.tsx — le guichet
// de la Grande salle de lecture (lot 8 de docs/PLAN-womens-library.md) :
// signaler un comportement à la modération de l'association.
//
// Il ouvre /support PRÉ-REMPLI (`utils/support/prefill.ts`, via
// `readingRoom/shelves`) : catégorie `behavior`, case « Rester anonyme »
// cochée — décochable par qui veut une réponse, et un second lien sans
// l'anonymat. Même onglet : on quitte la salle pour écrire.
//
// RIEN DE LA SALLE DANS LE LIEN (ni sujet, ni message, ni identifiant) : le
// ticket ne dit pas d'où l'on vient — sinon il deviendrait la trace de qui
// fréquente la salle. Les boutons et les rappels reprennent les mots de
// /securite (namespace `safetyPage`).

import { useId } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsReadingRoom from '@/lib/i18n/locales/fr/playerLibraryReadingRoom';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import { ButtonLink } from '@/features/ruban';
import { GUICHET_HREF, GUICHET_NAMED_HREF } from '../../readingRoom/shelves';
import { TEXT_MUTED } from '../social/shared';

export default function ReadingRoomGuichet({
  headingId,
}: {
  /** L'id du titre : il nomme la section, ou le dialogue ouvert depuis la vue. */
  headingId: string;
}) {
  const t = useT(nsReadingRoom);
  const ts = useT(nsSafetyPage);
  const hintId = useId();

  return (
    <div className="flex flex-col gap-3" data-reading-guichet="">
      <h2 id={headingId} className="text-lg font-bold text-[var(--t1,#f4edf7)]">
        {t.guichet.title}
      </h2>
      <p className={TEXT_MUTED}>{t.guichet.body}</p>
      <p
        role="note"
        className="rounded-[var(--r-ctrl,4px)] border border-red-300/60 bg-red-950/40 px-3 py-2 text-sm font-semibold text-[var(--t1,#f4edf7)]"
      >
        {ts.reportNotEmergency}
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink
          href={GUICHET_HREF}
          variant="primary"
          size="sm"
          aria-describedby={hintId}
        >
          {ts.reportCta}
        </ButtonLink>
        <ButtonLink href={GUICHET_NAMED_HREF} size="sm">
          {ts.reportCtaNamed}
        </ButtonLink>
      </div>
      <p id={hintId} className="text-xs text-[var(--t3,#a39ba6)]">
        {ts.reportCtaHint} {t.guichet.noContext}
      </p>
    </div>
  );
}
