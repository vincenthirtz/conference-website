// features/player/tcg/ui/trades/TradePickGrid.tsx — choisir des cartes à
// offrir (les miennes) ou à demander (ses doubles). La carte EST le bouton de
// sélection : `insideInteractive`, le crédit s'y lit sans lien.

import TcgCard from '@/components/tcg/TcgCard';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import {
  keyOf,
  nameOf,
  subjectOf,
  type MyCard,
  type TradeCardView,
} from '../../tradeModel';
import type { TcgCardLabels } from '../useTcgCardLabels';

export default function TradePickGrid({
  side,
  cards,
  picked,
  busy,
  labels,
  onToggle,
}: {
  side: 'offered' | 'requested';
  cards: Array<TradeCardView | MyCard>;
  picked: string[];
  busy: string | null;
  labels: TcgCardLabels;
  onToggle: (side: 'offered' | 'requested', key: string) => void;
}) {
  const t = useT(nsTcgTrade);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const key = keyOf(card);
        const mine = side === 'offered' ? (card as MyCard) : null;
        const unavailable = mine !== null && mine.available < 1;
        const isPicked = picked.includes(key);
        const note = mine
          ? mine.tradeableCopies < 1
            ? t.notTradeable
            : mine.available < 1
              ? t.alreadyPromised
              : mine.copies <= 1
                ? t.lastCopy
                : null
          : null;
        const rarity = card.rarity ?? 'common';
        return (
          <li key={key}>
            <button
              type="button"
              aria-pressed={isPicked}
              disabled={unavailable || busy !== null}
              onClick={() => onToggle(side, key)}
              aria-label={format(t.pickAria, {
                name: nameOf(card) ?? t.unnamedCard,
                rarity: labels.rarity[rarity],
              })}
              className={`block min-h-11 w-full rounded-xl text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] disabled:cursor-not-allowed disabled:opacity-40 ${
                isPicked
                  ? 'ring-2 ring-[var(--lf,#7fca65)] ring-offset-2 ring-offset-[var(--canvas,#07030a)]'
                  : ''
              }`}
            >
              <TcgCard
                subject={subjectOf(card)}
                rarity={rarity}
                isFoil={card.isFoil ?? false}
                noLink
                insideInteractive
                labels={labels}
              />
            </button>
            {note && (
              <p className="mt-1 text-center text-[11px] text-[var(--t3,#a39ba6)]">
                {note}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
