// features/player/tcg/ui/trades/TradeComposerPanel.tsx — composer une
// proposition : une partenaire volontaire, ses doubles, mes cartes, à parité.
// AUCUN MONTANT, AUCUN PAQUET, AUCUN MESSAGE. Présentationnel.
//
// Une lecture ratée a SON message (`'error'`), jamais « personne » ni
// « aucun double ».

import type { ReactNode } from 'react';
import { Button, Card } from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import type { TradeComposer } from '../../hooks/useTradeComposer';
import type { TcgCardLabels } from '../useTcgCardLabels';
import TradePickGrid from './TradePickGrid';

const MUTED = 'text-sm text-[var(--t3,#a39ba6)]';

export default function TradeComposerPanel({
  composer,
  maxCards,
  busy,
  labels,
}: {
  composer: TradeComposer;
  maxCards: number;
  busy: string | null;
  labels: TcgCardLabels;
}) {
  const t = useT(nsTcgTrade);
  const c = composer;

  const failed = (text: string) => (
    <p role="alert" className="text-sm text-[var(--err,#ff6b6b)]">
      {text}{' '}
      <Button variant="ghost" size="xs" onClick={() => void c.load()}>
        {t.retry}
      </Button>
    </p>
  );
  const listOr = (
    value: unknown[] | null | 'error',
    empty: string,
    grid: ReactNode
  ) =>
    value === null ? (
      <p className={MUTED}>{t.loading}</p>
    ) : value === 'error' ? null : value.length === 0 ? (
      <p className={MUTED}>{empty}</p>
    ) : (
      grid
    );

  return (
    <Card
      as="section"
      padding="sm"
      aria-labelledby="trade-compose-title"
      className="sm:p-6"
    >
      <h2 id="trade-compose-title" className="text-lg font-semibold">
        {t.composeTitle}
      </h2>

      {c.partners === null ? (
        <p className={`mt-3 ${MUTED}`}>{t.loading}</p>
      ) : c.partners === 'error' ? (
        <div className="mt-3">{failed(t.err_generic)}</div>
      ) : c.partners.length === 0 ? (
        <p className={`mt-3 ${MUTED}`}>{t.partnersEmpty}</p>
      ) : (
        <>
          <label
            htmlFor="trade-partner"
            className="mt-4 block text-sm font-medium text-[var(--t1,#f4edf7)]"
          >
            {t.partnerLabel}
          </label>
          <select
            id="trade-partner"
            value={c.partnerId}
            onChange={(e) => void c.choosePartner(e.target.value)}
            className="mt-2 min-h-11 w-full max-w-sm rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)]"
          >
            <option value="">{t.partnerPlaceholder}</option>
            {c.partners.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.displayName}
              </option>
            ))}
          </select>

          {c.partnerId && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                {t.theirDoublesTitle}
              </h3>
              <div className="mt-3">
                {c.theirCards === 'error' &&
                  failed(c.theirError ?? t.err_generic)}
                {listOr(
                  c.theirCards,
                  t.theirDoublesEmpty,
                  Array.isArray(c.theirCards) && (
                    <TradePickGrid
                      side="requested"
                      cards={c.theirCards}
                      picked={c.requested}
                      busy={busy}
                      labels={labels}
                      onToggle={c.togglePick}
                    />
                  )
                )}
              </div>

              <h3 className="mt-6 text-sm font-semibold text-[var(--t1,#f4edf7)]">
                {t.myCardsTitle}
              </h3>
              <div className="mt-3">
                {c.myCards === 'error' && failed(t.err_generic)}
                {listOr(
                  c.myCards,
                  t.myCardsEmpty,
                  Array.isArray(c.myCards) && (
                    <TradePickGrid
                      side="offered"
                      cards={c.myCards}
                      picked={c.offered}
                      busy={busy}
                      labels={labels}
                      onToggle={c.togglePick}
                    />
                  )
                )}
              </div>

              <div className="sticky bottom-3 mt-6 flex flex-col gap-2 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className="text-sm text-[var(--t1,#f4edf7)]"
                  aria-live="polite"
                >
                  {format(t.summary, {
                    offered: c.offered.length,
                    requested: c.requested.length,
                  })}
                  {c.offered.length !== c.requested.length && (
                    <span className="block text-xs text-[var(--t3,#a39ba6)]">
                      {t.parityHint}
                    </span>
                  )}
                  <span className="block text-xs text-[var(--t4,#807984)]">
                    {format(t.maxHint, { max: maxCards })}
                  </span>
                </p>
                <Button
                  variant="primary"
                  onClick={() => void c.submit()}
                  disabled={!c.canSubmit || busy !== null}
                  aria-busy={busy === 'propose'}
                >
                  {busy === 'propose' ? t.submitting : t.submit}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
