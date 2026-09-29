// features/player/tcg/ui/TcgHeaderLinks.tsx — sous le titre : le guide et les
// échanges (avec la pastille des propositions reçues). Présentationnel.
//
// Discrets, mais AU TITRE : « d'où viennent les paquets » et « que devient ma
// photo » se demandent en regardant sa collection.

import Link from 'next/link';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';

const LINK =
  'font-medium text-[var(--or-300,#dea3f6)] underline-offset-4 transition hover:text-[var(--or-200,#eec4ff)] hover:underline';

export default function TcgHeaderLinks({
  tradesReceived,
}: {
  tradesReceived: number;
}) {
  const t = useT(nsPlayerTcg);
  const tTrade = useT(nsTcgTrade);
  return (
    <span className="flex flex-wrap items-baseline gap-4 text-sm">
      <Link href="/player/tcg-guide" className={LINK}>
        {t.guideLink}
      </Link>
      <Link href="/player/tcg/echanges" className={LINK}>
        {tTrade.entryLink}
        {/* Le chiffre est décoratif ; le nom accessible du lien porte la
            phrase complète, un « 2 » seul ne dirait rien. */}
        {tradesReceived > 0 && (
          <>
            <span
              aria-hidden
              className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--or,#b467d1)] px-1.5 text-xs font-bold leading-5 text-[var(--canvas,#07030a)]"
            >
              {tradesReceived}
            </span>
            <span className="sr-only">
              {' — '}
              {tradesReceived > 1
                ? format(t.tradesPendingBadge_other, { count: tradesReceived })
                : t.tradesPendingBadge_one}
            </span>
          </>
        )}
      </Link>
    </span>
  );
}
