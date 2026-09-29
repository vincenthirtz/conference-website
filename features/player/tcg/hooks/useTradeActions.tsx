// features/player/tcg/hooks/useTradeActions.tsx — accepter, refuser, annuler,
// bloquer (lot P14, extrait de pages/player/tcg/echanges.tsx, mêmes
// confirmations, même relecture).
//
// Relecture sur TOUTES les issues (`reloadAfterMutation`) : un échange accepté
// dont la réponse s'est perdue a DÉJÀ déplacé les cartes — le laisser affiché
// « en attente » invitait à recliquer.

import { useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { reloadAfterMutation } from '@/utils/tcg/reloadAfterMutation';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import { tradeClient } from '../tradeClient';
import { tradeErrorText, type Limits, type TradeView } from '../tradeModel';

type Confirm = ReturnType<typeof useConfirmDialog>['confirm'];
export type TradeAction = 'accept' | 'decline' | 'cancel';

export function useTradeActions(opts: {
  confirm: Confirm;
  limits: Limits | undefined;
  busy: string | null;
  setBusy: (busy: string | null) => void;
  announce: (text: string) => void;
  /** Relit la boîte et la préférence après un geste. */
  reload: () => Promise<unknown>;
}) {
  const t = useT(nsTcgTrade);
  const { addToast } = useToast();
  const { confirm, limits, busy, setBusy, announce, reload } = opts;

  const act = useCallback(
    async (
      trade: TradeView,
      action: TradeAction,
      /** Le geste a DÉJÀ été confirmé (blocage puis refus dans la foulée). */
      o?: { skipConfirm?: boolean }
    ) => {
      const name = trade.counterpart.displayName ?? t.unknownName;
      let ok = o?.skipConfirm === true;
      if (ok) {
        // Confirmé ailleurs : on saute la question, pas les écritures.
      } else if (action === 'accept') {
        // Céder son DERNIER exemplaire d'un sujet se dit avant d'accepter.
        const givesLast = trade.requested.some(
          (c) =>
            typeof (c as { ownedCopies?: number }).ownedCopies === 'number' &&
            ((c as { ownedCopies?: number }).ownedCopies ?? 0) <= 1
        );
        ok = await confirm({
          title: t.confirmAcceptTitle,
          subtitle: format(t.confirmAcceptBody, {
            give: trade.requested.length,
            get: trade.offered.length,
          }),
          body: givesLast ? (
            <p className="text-sm text-[var(--warn,#f5a524)]">
              {t.confirmAcceptLastCopy}
            </p>
          ) : undefined,
          variant: givesLast ? 'warning' : 'info',
          confirmLabel: t.accept,
          cancelLabel: t.confirmBack,
        });
      } else if (action === 'decline') {
        ok = await confirm({
          title: t.confirmDeclineTitle,
          subtitle: format(t.confirmDeclineBody, {
            hours: limits?.declineCooldownHours ?? 24,
          }),
          variant: 'warning',
          confirmLabel: t.decline,
          cancelLabel: t.confirmBack,
        });
      } else {
        ok = await confirm({
          title: t.confirmCancelTitle,
          subtitle: name,
          variant: 'warning',
          confirmLabel: t.cancel,
          cancelLabel: t.confirmBack,
        });
      }
      if (!ok) return;

      setBusy(`${action}:${trade.id}`);
      await reloadAfterMutation(
        async () => {
          try {
            await tradeClient.act(trade.id, action);
          } catch (err) {
            if (!(err instanceof PlayerHttpError)) throw err;
            const text = tradeErrorText(t, err.code);
            addToast(text, 'error');
            announce(text);
            return;
          }
          const message =
            action === 'accept'
              ? t.toastAccepted
              : action === 'decline'
                ? t.toastDeclined
                : t.toastCancelled;
          addToast(message, 'success');
          announce(message);
        },
        { reload, onError: () => addToast(t.err_generic, 'error') }
      );
      setBusy(null);
    },
    [t, limits, confirm, setBusy, addToast, announce, reload]
  );

  /**
   * Bloquer la proposante — puis refuser, dans la foulée. L'ORDRE COMPTE :
   * bloquer d'abord ferme la porte même si le refus échoue.
   */
  const blockProposer = useCallback(
    async (trade: TradeView) => {
      if (busy) return;
      const ok = await confirm({
        title: t.blockConfirmTitle,
        subtitle: format(t.blockConfirmBody, {
          name: trade.counterpart.displayName ?? t.unknownName,
        }),
        variant: 'warning',
        confirmLabel: t.blockPerson,
        cancelLabel: t.confirmBack,
      });
      if (!ok) return;
      setBusy(`block:${trade.id}`);
      try {
        await tradeClient.block(trade.counterpart.userId);
        addToast(t.blockDone, 'success');
        await act(trade, 'decline', { skipConfirm: true });
      } catch (err) {
        addToast((err as Error)?.message ?? t.err_generic, 'error');
      } finally {
        setBusy(null);
      }
    },
    [act, busy, confirm, setBusy, addToast, t]
  );

  return { act, blockProposer };
}
