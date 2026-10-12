// components/tcg/live/CardOfWeekSection.tsx
//
// « Carte de la semaine » : choisie côté serveur, déterministe par semaine ISO
// (`pickWeeklyKey`), jamais une carte de joueuse. Rien à afficher = rien rendu.

import type { JSX } from 'react';
import {
  rubanCard,
  rubanFaint,
  rubanMuted,
  rubanStrong,
} from '@/features/ruban/ruban';
import Link from 'next/link';
import type { LiveCardOfWeek } from '@/utils/tcg/live';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgLive from '@/lib/i18n/locales/fr/tcgLive';
import LiveCard from './LiveCard';

/** Ancre du catalogue sur `/tcg`. */
export const TCG_CATALOGUE_HREF = '/tcg#catalogue';

export default function CardOfWeekSection({
  cardOfWeek,
}: {
  cardOfWeek: LiveCardOfWeek | null;
}): JSX.Element | null {
  const t = useT(nsTcgLive);
  if (!cardOfWeek) return null;
  // `2026-W42` → « 42 » : le numéro suffit à l'écran.
  const weekNumber = String(Number(cardOfWeek.week.split('-W')[1] ?? ''));
  return (
    <section aria-labelledby="tcg-live-week-title">
      <h2
        id="tcg-live-week-title"
        className="mb-1 text-sm font-semibold uppercase tracking-widest text-brand-gradient"
      >
        {t.weekTitle}
      </h2>
      <p className={`mb-3 text-sm ${rubanMuted}`}>{t.weekIntro}</p>
      <div
        className={`${rubanCard} flex flex-col items-center gap-3 p-4 sm:p-5`}
      >
        <p className={`text-xs uppercase tracking-wider ${rubanFaint}`}>
          {format(t.weekLabel, { week: weekNumber })}
        </p>
        <div className="w-full max-w-[14rem]">
          <LiveCard card={cardOfWeek.card} />
        </div>
        <Link
          href={TCG_CATALOGUE_HREF}
          className={`text-sm underline ${rubanStrong}`}
        >
          {t.weekCatalogue}
        </Link>
      </div>
    </section>
  );
}
