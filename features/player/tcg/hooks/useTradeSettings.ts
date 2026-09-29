// features/player/tcg/hooks/useTradeSettings.ts — ma préférence d'échange
// (lot P14, extrait de pages/player/tcg/echanges.tsx, même comportement).
//
// DÉSACTIVER ANNULE ce qui attend : l'interrupteur est RELU sur toutes les
// issues (`reloadAfterMutation`), sinon il mentirait après une réponse perdue.

import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { format, useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import { reloadAfterMutation } from '@/utils/tcg/reloadAfterMutation';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import { tradeClient } from '../tradeClient';
import {
  tradeErrorText,
  type Settings,
  type TradeLoadState,
} from '../tradeModel';

export function useTradeSettings(opts: {
  announce: (text: string) => void;
  setBusy: (busy: string | null) => void;
}) {
  const t = useT(nsTcgTrade);
  const { addToast } = useToast();
  const { announce, setBusy } = opts;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<TradeLoadState>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setSettings(await tradeClient.settings());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  const toggle = useCallback(async () => {
    if (!settings) return;
    const next = !settings.acceptsProposals;
    setBusy('settings');
    await reloadAfterMutation(
      async () => {
        let body: Awaited<ReturnType<typeof tradeClient.setTrading>>;
        try {
          body = await tradeClient.setTrading(next);
        } catch (err) {
          if (!(err instanceof PlayerHttpError)) throw err;
          addToast(tradeErrorText(t, err.code), 'error');
          return;
        }
        const cancelledCount =
          (body?.cancelled?.received ?? 0) + (body?.cancelled?.sent ?? 0);
        const message = next
          ? t.prefToastOn
          : cancelledCount > 0
            ? format(t.prefToastOffCancelled, { count: cancelledCount })
            : t.prefToastOff;
        addToast(message, 'success');
        announce(message);
      },
      { reload: load, onError: () => addToast(t.err_generic, 'error') }
    );
    setBusy(null);
  }, [settings, setBusy, addToast, t, announce, load]);

  return { settings, state, load, toggle };
}
