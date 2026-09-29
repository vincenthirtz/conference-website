// features/player/tcg/ui/trades/TradePrefPanel.tsx — « recevoir des
// propositions ». L'EXPLICATION AVANT L'INTERRUPTEUR : échanger, c'est devenir
// visible d'autres collectionneuses (pseudo, doubles). Présentationnel.

import { Button, Card } from '@/features/ruban';
import { Skeleton } from '@/components/ui/Skeleton';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import type { Settings, TradeLoadState } from '../../tradeModel';

export default function TradePrefPanel({
  settings,
  state,
  busy,
  formatDate,
  onRetry,
  onToggle,
}: {
  settings: Settings | null;
  state: TradeLoadState;
  busy: string | null;
  formatDate: (iso: string | null) => string;
  onRetry: () => void;
  onToggle: () => void;
}) {
  const t = useT(nsTcgTrade);
  const on = settings?.acceptsProposals === true;
  return (
    <Card
      as="section"
      padding="sm"
      aria-labelledby="trade-pref-title"
      className="sm:p-6"
    >
      <h2 id="trade-pref-title" className="text-lg font-semibold">
        {t.prefTitle}
      </h2>
      {state === 'loading' && !settings ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : state === 'error' || !settings ? (
        <div role="alert" className="mt-3 text-sm text-[var(--err,#ff6b6b)]">
          {t.err_generic}{' '}
          <Button variant="ghost" size="xs" onClick={onRetry}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
            {on ? t.prefStateOn : t.prefStateOff}
          </p>
          <p className="mt-4 text-sm font-medium text-[var(--t1,#f4edf7)]">
            {t.prefWhatItMeans}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--t2,#c7bfca)]">
            <li>{t.prefVisible}</li>
            <li>{t.prefDoubles}</li>
            <li>{t.prefNoMessage}</li>
            <li>{t.prefOffCancels}</li>
          </ul>

          {!on && settings.eligible === false && (
            <p className="mt-4 text-sm text-[var(--warn,#f5a524)]">
              {settings.eligibilityReason === 'too_recent' &&
              settings.eligibleAt
                ? format(t.prefOpensOn, {
                    date: formatDate(settings.eligibleAt),
                  })
                : t.prefNoCollection}
            </p>
          )}

          <Button
            variant={on ? 'ghost' : 'secondary'}
            className="mt-4"
            onClick={onToggle}
            disabled={busy !== null || (!on && settings.eligible === false)}
            aria-busy={busy === 'settings'}
          >
            {busy === 'settings'
              ? t.prefSaving
              : on
                ? t.prefDisable
                : t.prefEnable}
          </Button>

          <details className="mt-5 text-sm text-[var(--t2,#c7bfca)]">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--t1,#f4edf7)]">
              {t.rulesTitle}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                {format(t.rulesParity, {
                  max: settings.limits.maxCardsPerSide,
                })}
              </li>
              <li>{t.rulesNoCoins}</li>
              <li>{t.rulesTradeable}</li>
              <li>{t.rulesDoubles}</li>
              <li>{t.rulesSets}</li>
              <li>
                {format(t.rulesExpiry, { hours: settings.limits.ttlHours })}
              </li>
              <li>
                {format(t.rulesLimits, {
                  sent: settings.limits.maxPendingSent,
                  daily: settings.limits.maxAcceptedPerDay,
                })}
              </li>
              <li>
                {format(t.rulesCooldown, {
                  hours: settings.limits.declineCooldownHours,
                })}
              </li>
              <li>
                {format(t.rulesAge, {
                  account: settings.limits.minAccountAgeDays,
                  collection: settings.limits.minCollectionAgeDays,
                })}
              </li>
            </ul>
          </details>
        </>
      )}
    </Card>
  );
}
