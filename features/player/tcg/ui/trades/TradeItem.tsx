// features/player/tcg/ui/trades/TradeItem.tsx — une proposition de ma boîte :
// qui, quoi contre quoi, l'écart de rareté (dit AVANT d'accepter), et les
// gestes. Présentationnel.

import TcgCard from '@/components/tcg/TcgCard';
import { Button, Card, Chip } from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import { tradeBalance, type TradeBalance } from '@/utils/tcg/tradeBalance';
import { keyOf, subjectOf, type TradeView } from '../../tradeModel';
import type { TradeAction } from '../../hooks/useTradeActions';
import type { TcgCardLabels } from '../useTcgCardLabels';

function TradeCards({
  cards,
  showOwned,
  labels,
}: {
  cards: TradeView['offered'] | TradeView['requested'];
  showOwned: boolean;
  labels: TcgCardLabels;
}) {
  const t = useT(nsTcgTrade);
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {cards.map((card) => {
        const owned = (card as { ownedCopies?: number }).ownedCopies;
        return (
          <li key={keyOf(card)}>
            <TcgCard
              subject={subjectOf(card)}
              rarity={card.rarity ?? 'common'}
              isFoil={card.isFoil ?? false}
              noLink
              labels={labels}
            />
            {showOwned && typeof owned === 'number' && (
              <p
                className={`mt-1 text-center text-[11px] ${owned <= 1 ? 'text-[var(--warn,#f5a524)]' : 'text-[var(--t3,#a39ba6)]'}`}
              >
                {owned === 0
                  ? t.youOwnNone
                  : format(t.youOwn, { count: owned })}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La phrase du bilan : trois verdicts, trois formulations — celle qui alerte
 * doit pouvoir s'écrire autrement. La parité porte sur le NOMBRE, jamais sur
 * la valeur : informatif, jamais bloquant.
 */
function balanceLabel(
  dict: typeof nsTcgTrade.fr,
  rarity: TcgCardLabels['rarity'],
  balance: TradeBalance
): string {
  const bestGet = rarity[balance.offered.best ?? 'common'];
  const bestGive = rarity[balance.requested.best ?? 'common'];
  if (balance.verdict === 'favours_recipient') {
    return format(dict.balanceForYou, { bestGet, bestGive });
  }
  if (balance.verdict === 'favours_proposer') {
    return format(dict.balanceAgainstYou, { bestGet, bestGive });
  }
  return format(dict.balanceEven, {
    get: balance.offered.count,
    give: balance.requested.count,
  });
}

export default function TradeItem({
  trade,
  busy,
  labels,
  formatDate,
  onAct,
  onBlock,
}: {
  trade: TradeView;
  busy: string | null;
  labels: TcgCardLabels;
  formatDate: (iso: string | null) => string;
  onAct: (trade: TradeView, action: TradeAction) => void;
  onBlock: (trade: TradeView) => void;
}) {
  const t = useT(nsTcgTrade);
  const name = trade.counterpart.displayName ?? t.unknownName;
  const received = trade.direction === 'received';
  const pending = trade.status === 'pending';
  const statusLabel: Record<TradeView['status'], string> = {
    pending: t.statusPending,
    accepted: t.statusAccepted,
    declined: t.statusDeclined,
    cancelled: t.statusCancelled,
    expired: t.statusExpired,
  };
  const reason =
    trade.reason === 'offered_unavailable'
      ? t.reasonOfferedUnavailable
      : trade.reason === 'card_unavailable'
        ? t.reasonCardUnavailable
        : trade.reason === 'trading_disabled'
          ? t.reasonTradingDisabled
          : trade.reason === 'proposer_cancelled'
            ? t.reasonProposerCancelled
            : null;
  // Calculé À L'AFFICHAGE : une lecture des cartes déjà reçues.
  const balance =
    received && pending
      ? tradeBalance({ offered: trade.offered, requested: trade.requested })
      : null;
  const isBusy = (action: string) => busy === `${action}:${trade.id}`;

  return (
    <Card as="li" padding="sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {format(received ? t.fromName : t.toName, { name })}
        </h3>
        <p className="flex items-center gap-2 text-xs text-[var(--t3,#a39ba6)]">
          <Chip tone={pending ? 'brand' : 'neutral'}>
            {statusLabel[trade.status]}
          </Chip>
          {pending
            ? format(t.expiresOn, { date: formatDate(trade.expiresAt) })
            : format(t.resolvedOn, { date: formatDate(trade.resolvedAt) })}
        </p>
      </div>
      {reason && trade.status === 'cancelled' && (
        <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">{reason}</p>
      )}

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--t3,#a39ba6)]">
            {received ? t.theyOffer : t.youOffer}
          </h4>
          <TradeCards cards={trade.offered} showOwned={false} labels={labels} />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--t3,#a39ba6)]">
            {received ? t.theyRequest : t.youRequest}
          </h4>
          <TradeCards
            cards={trade.requested}
            showOwned={received && pending}
            labels={labels}
          />
        </div>
      </div>

      {balance && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            balance.verdict === 'favours_proposer'
              ? 'bg-[rgba(245,165,36,.1)] text-[var(--warn,#f5a524)]'
              : 'bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)]'
          }`}
        >
          {balanceLabel(t, labels.rarity, balance)}
        </p>
      )}

      {pending && (
        <div className="mt-4 flex flex-wrap gap-2">
          {received ? (
            <>
              <Button
                variant="primary"
                onClick={() => onAct(trade, 'accept')}
                disabled={busy !== null}
                aria-busy={isBusy('accept')}
                aria-label={format(t.acceptAria, { name })}
              >
                {isBusy('accept') ? t.working : t.accept}
              </Button>
              <Button
                variant="ghost"
                onClick={() => onAct(trade, 'decline')}
                disabled={busy !== null}
                aria-busy={isBusy('decline')}
                aria-label={format(t.declineAria, { name })}
              >
                {isBusy('decline') ? t.working : t.decline}
              </Button>
              {/* « Pas avec elle » : entre refuser et couper les échanges
                  pour tout le monde. */}
              <Button
                variant="ghost"
                onClick={() => onBlock(trade)}
                disabled={busy !== null}
                aria-busy={isBusy('block')}
              >
                {isBusy('block') ? t.working : t.blockPerson}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              onClick={() => onAct(trade, 'cancel')}
              disabled={busy !== null}
              aria-busy={isBusy('cancel')}
              aria-label={format(t.cancelAria, { name })}
            >
              {isBusy('cancel') ? t.working : t.cancel}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
