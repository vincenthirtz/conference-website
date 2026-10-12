// components/tcg/live/RecentPullsSection.tsx
//
// « Derniers tirages rares ». Purement d'affichage : le nom (ou son absence)
// est décidé côté serveur par la règle de consentement de `utils/tcg/live.ts`
// — `collector: null` s'affiche « Une joueuse ». L'âge est en heures entières,
// jamais une heure exacte.

import type { JSX } from 'react';
import {
  rubanCard,
  rubanFaint,
  rubanMuted,
  rubanStrong,
} from '@/features/ruban/ruban';
import type { LivePull } from '@/utils/tcg/live';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgLive from '@/lib/i18n/locales/fr/tcgLive';
import LiveCard from './LiveCard';

/** Âge lisible : « il y a moins d'une heure », « il y a 3 h », « hier »… */
export function formatPullAge(
  ageHours: number,
  t: {
    ageUnderHour: string;
    ageHours: string;
    ageDays_one: string;
    ageDays_other: string;
  }
): string {
  if (ageHours < 1) return t.ageUnderHour;
  if (ageHours < 24) return format(t.ageHours, { count: ageHours });
  const days = Math.floor(ageHours / 24);
  return days === 1 ? t.ageDays_one : format(t.ageDays_other, { count: days });
}

export default function RecentPullsSection({
  pulls,
}: {
  pulls: LivePull[];
}): JSX.Element {
  const t = useT(nsTcgLive);
  return (
    <section aria-labelledby="tcg-live-pulls-title">
      <h2
        id="tcg-live-pulls-title"
        className="mb-1 text-sm font-semibold uppercase tracking-widest text-brand-gradient"
      >
        {t.pullsTitle}
      </h2>
      <p className={`mb-3 text-sm ${rubanMuted}`}>{t.pullsIntro}</p>
      {pulls.length === 0 ? (
        <p className={`${rubanCard} p-4 text-sm ${rubanMuted}`}>
          {t.pullsEmpty}
        </p>
      ) : (
        <ul
          className={`${rubanCard} grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:gap-4 sm:p-5`}
        >
          {pulls.map((pull, index) => (
            // Aucun identifiant de tirage dans la réponse, à dessein : la clé
            // combine le sujet et la position, stable pour une même réponse.
            <li key={`${pull.card.key}-${index}`} className="min-w-0">
              <LiveCard card={pull.card} />
              <p className={`mt-2 truncate text-xs ${rubanStrong}`}>
                {format(t.pulledBy, {
                  name: pull.collector ?? t.anonymousCollector,
                })}
              </p>
              <p className={`text-xs ${rubanFaint}`}>
                {formatPullAge(pull.ageHours, t)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
