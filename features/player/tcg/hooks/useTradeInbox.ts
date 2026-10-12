// features/player/tcg/hooks/useTradeInbox.ts — ma boîte de propositions,
// reçues / envoyées, ouvertes / closes, paginée par curseur (lot P14).
// Une lecture ratée a SON état (`error`), jamais une boîte vide.
//
// SEULE LA DERNIÈRE LECTURE ÉCRIT. Passer de « reçues » à « envoyées » (ou
// d'« ouvertes » à « closes ») pendant qu'une lecture court : la réponse
// périmée ne doit pas remplir l'autre boîte. Chaque lecture annule la
// précédente (AbortController) ; une réponse annulée est ignorée, sans toast.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import { tradeClient } from '../tradeClient';
import type { Box, ListState, TradeLoadState, TradeView } from '../tradeModel';

export function useTradeInbox() {
  const t = useT(nsTcgTrade);
  const { addToast } = useToast();
  const [box, setBox] = useState<Box>('received');
  const [listState, setListState] = useState<ListState>('open');
  const [trades, setTrades] = useState<TradeView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<TradeLoadState>('loading');

  const reqRef = useRef<AbortController | null>(null);
  useEffect(() => () => reqRef.current?.abort(), []);

  const load = useCallback(
    async (append: boolean, fromCursor: string | null) => {
      reqRef.current?.abort();
      const controller = new AbortController();
      reqRef.current = controller;
      if (!append) setState('loading');
      try {
        const data = await tradeClient.list(
          box,
          listState,
          append ? fromCursor : null,
          controller.signal
        );
        if (controller.signal.aborted) return;
        setTrades((prev) => (append ? [...prev, ...data.trades] : data.trades));
        setCursor(data.nextCursor);
        setState('ready');
      } catch {
        if (controller.signal.aborted) return;
        if (!append) setState('error');
        else addToast(t.listError, 'error');
      }
    },
    [box, listState, addToast, t]
  );

  return {
    box,
    setBox,
    listState,
    setListState,
    trades,
    cursor,
    state,
    load,
  };
}

export type TradeInbox = ReturnType<typeof useTradeInbox>;
