// features/player/tcg/ui/WalletHistoryPanel.tsx — « D'où viennent mes
// pièces ? ». Replié par défaut, chargé au clic : le solde suffit à la
// plupart des visites. Présentationnel.

import { Button, Card } from '@/features/ruban';
import { TcgAmount, TcgCoin } from '@/components/tcg/TcgCoin';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { walletSourceLabel, type WalletEntry } from '../model';
import type { WalletState } from '../hooks/useTcgWallet';

export default function WalletHistoryPanel({
  open,
  state,
  wallet,
  onToggle,
}: {
  open: boolean;
  state: WalletState;
  wallet: { entries: WalletEntry[]; truncated: boolean } | null;
  onToggle: () => void;
}) {
  const t = useT(nsPlayerTcg);
  return (
    <Card as="section" padding="sm" className="sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <TcgCoin size={18} />
          {t.walletTitle}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="tcg-wallet-history"
        >
          {open ? t.walletHide : t.walletShow}
        </Button>
      </div>

      <div id="tcg-wallet-history" hidden={!open}>
        {state === 'loading' && (
          <p role="status" className="mt-4 text-sm text-[var(--t3,#a39ba6)]">
            {t.walletLoading}
          </p>
        )}
        {state === 'error' && (
          <p role="alert" className="mt-4 text-sm text-[var(--t2,#c7bfca)]">
            {t.walletError}
          </p>
        )}
        {state === 'ready' && wallet !== null && (
          <>
            {wallet.entries.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--t3,#a39ba6)]">
                {t.walletEmpty}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                {wallet.entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-[var(--t2,#c7bfca)]">
                      <span className="block truncate">
                        {walletSourceLabel(e.sourceKind, t)}
                      </span>
                      {/* Le motif d'une correction : sans lui, « Ajustement
                          par l'équipe » ne dit pas CE qui a été corrigé. */}
                      {e.note ? (
                        <span className="mt-0.5 block break-words text-xs text-[var(--t3,#a39ba6)]">
                          {e.note}
                        </span>
                      ) : null}
                    </span>
                    {/* Le signe est porté par la couleur ET par le texte. */}
                    <TcgAmount
                      value={e.amount}
                      signed
                      size={14}
                      className={
                        e.amount >= 0
                          ? 'shrink-0 font-semibold text-[var(--lf,#7fca65)]'
                          : 'shrink-0 font-semibold text-[var(--t3,#a39ba6)]'
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {wallet.truncated && (
              <p className="mt-3 text-xs text-[var(--t3,#a39ba6)]">
                {format(t.walletTruncated, { count: wallet.entries.length })}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
