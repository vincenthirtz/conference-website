// components/tcg/live/CollectorsLeaderboard.tsx
//
// « Classement des collectionneuses ». Seules y figurent les joueuses qui ont
// ACTIVÉ leur vitrine (règle de `utils/tcg/live.ts` : exclure plutôt
// qu'anonymiser). D'où l'invitation, sous le tableau, à activer la sienne.

import type { JSX } from 'react';
import {
  rubanCard,
  rubanFaint,
  rubanMuted,
  rubanStrong,
} from '@/features/ruban/ruban';
import Link from 'next/link';
import type { LiveCollector } from '@/utils/tcg/live';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsTcgLive from '@/lib/i18n/locales/fr/tcgLive';

export default function CollectorsLeaderboard({
  collectors,
}: {
  collectors: LiveCollector[];
}): JSX.Element {
  const t = useT(nsTcgLive);
  const locale = useLocale();
  const percent = (value: number) =>
    format(t.collectorsPercent, {
      value: value.toLocaleString(locale, {
        maximumFractionDigits: 1,
      }),
    });

  return (
    <section aria-labelledby="tcg-live-collectors-title">
      <h2
        id="tcg-live-collectors-title"
        className="mb-1 text-sm font-semibold uppercase tracking-widest text-brand-gradient"
      >
        {t.collectorsTitle}
      </h2>
      <p className={`mb-3 text-sm ${rubanMuted}`}>{t.collectorsIntro}</p>
      <div className={`${rubanCard} p-4 sm:p-5`}>
        {collectors.length === 0 ? (
          <p className={`text-sm ${rubanMuted}`}>{t.collectorsEmpty}</p>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead className={`text-xs uppercase tracking-wider ${rubanFaint}`}>
              <tr>
                <th scope="col" className="w-14 pb-2 pr-3 font-medium">
                  {t.collectorsRank}
                </th>
                <th scope="col" className="pb-2 pr-3 font-medium">
                  {t.collectorsName}
                </th>
                <th
                  scope="col"
                  className="hidden pb-2 pr-3 font-medium sm:table-cell"
                >
                  {t.collectorsCards}
                </th>
                <th scope="col" className="w-28 pb-2 text-right font-medium">
                  {t.collectorsCompletion}
                </th>
              </tr>
            </thead>
            <tbody>
              {collectors.map((c) => (
                <tr
                  key={c.rank}
                  className="border-t border-[var(--line,rgba(194,196,201,.12))]"
                >
                  <td className={`py-2 pr-3 tabular-nums ${rubanMuted}`}>
                    {c.rank}
                  </td>
                  <td className={`truncate py-2 pr-3 ${rubanStrong}`}>
                    {c.name}
                  </td>
                  <td
                    className={`hidden py-2 pr-3 tabular-nums sm:table-cell ${rubanMuted}`}
                  >
                    {format(t.collectorsOwned, {
                      owned: c.owned,
                      total: c.total,
                    })}
                  </td>
                  <td className={`py-2 text-right tabular-nums ${rubanStrong}`}>
                    {percent(c.completion)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={`mt-3 text-xs ${rubanFaint}`}>
          <Link
            href="/player/tcg"
            className="underline hover:text-[var(--t1,#f4edf7)]"
          >
            {t.collectorsJoin}
          </Link>
        </p>
      </div>
    </section>
  );
}
