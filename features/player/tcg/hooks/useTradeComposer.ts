// features/player/tcg/hooks/useTradeComposer.ts — composer une proposition
// (lot P14, extrait de pages/player/tcg/echanges.tsx).
//
// ON NE VOIT PAS LA COLLECTION D'UNE AUTRE : seulement ses DOUBLES
// ÉCHANGEABLES. CARTE CONTRE CARTE, à parité, sans montant ni message.
//
// ERREUR DE LECTURE ≠ LISTE VIDE (écart assumé du lot P14) : partenaires ou
// cartes illisibles affichaient « personne » / « aucun double » ; ils ont
// désormais un état d'erreur, avec de quoi réessayer.

import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import { reloadAfterMutation } from '@/utils/tcg/reloadAfterMutation';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import { tradeClient } from '../tradeClient';
import {
  keyOf,
  subjectRefOf,
  tradeErrorText,
  type MyCard,
  type Partner,
  type TradeCardView,
} from '../tradeModel';

/** `null` = en cours ; `'error'` = illisible (jamais confondu avec vide). */
export type Loaded<T> = T | null | 'error';

export function useTradeComposer(opts: {
  maxCards: number;
  announce: (text: string) => void;
  setBusy: (busy: string | null) => void;
  /** Après une proposition : relire la préférence (compteurs). */
  reloadSettings: () => Promise<void>;
  /** Après une proposition : afficher « envoyées, ouvertes ». */
  showSent: () => void;
}) {
  const t = useT(nsTcgTrade);
  const { addToast } = useToast();
  const { maxCards, announce, setBusy, reloadSettings, showSent } = opts;

  const [partners, setPartners] = useState<Loaded<Partner[]>>(null);
  const [partnerId, setPartnerId] = useState('');
  const [theirCards, setTheirCards] = useState<Loaded<TradeCardView[]>>(null);
  const [theirError, setTheirError] = useState<string | null>(null);
  const [myCards, setMyCards] = useState<Loaded<MyCard[]>>(null);
  const [offered, setOffered] = useState<string[]>([]);
  const [requested, setRequested] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [p, mine] = await Promise.all([
        tradeClient.partners(),
        tradeClient.myCards(),
      ]);
      setPartners(p.partners);
      setMyCards(mine.cards);
    } catch {
      setPartners('error');
      setMyCards('error');
    }
  }, []);

  const choosePartner = useCallback(
    async (id: string) => {
      setPartnerId(id);
      setRequested([]);
      setTheirCards(null);
      setTheirError(null);
      if (!id) return;
      try {
        setTheirCards((await tradeClient.partnerCards(id)).cards);
      } catch (err) {
        const text = tradeErrorText(
          t,
          err instanceof PlayerHttpError ? err.code : null
        );
        addToast(text, 'error');
        setTheirError(text);
        setTheirCards('error');
      }
    },
    [addToast, t]
  );

  const togglePick = useCallback(
    (side: 'offered' | 'requested', key: string) => {
      const setter = side === 'offered' ? setOffered : setRequested;
      setter((prev) =>
        prev.includes(key)
          ? prev.filter((k) => k !== key)
          : prev.length >= maxCards
            ? prev
            : [...prev, key]
      );
    },
    [maxCards]
  );

  const canSubmit =
    partnerId !== '' &&
    offered.length > 0 &&
    offered.length === requested.length &&
    offered.length <= maxCards;

  const submit = useCallback(async () => {
    if (!canSubmit || !Array.isArray(myCards) || !Array.isArray(theirCards))
      return;
    const byKey = new Map<string, TradeCardView>();
    for (const c of myCards) byKey.set(keyOf(c), c);
    for (const c of theirCards) byKey.set(keyOf(c), c);
    const refs = (keys: string[]) =>
      keys.flatMap((k) => {
        const card = byKey.get(k);
        return card ? [subjectRefOf(card)] : [];
      });
    setBusy('propose');
    // Relecture sur toutes les issues : une proposition validée dont la
    // réponse s'est perdue a RÉSERVÉ les exemplaires offerts.
    await reloadAfterMutation(
      async () => {
        try {
          await tradeClient.propose({
            recipientId: partnerId,
            offered: refs(offered),
            requested: refs(requested),
          });
        } catch (err) {
          if (!(err instanceof PlayerHttpError)) throw err;
          const text = tradeErrorText(t, err.code);
          addToast(text, 'error');
          announce(text);
          return;
        }
        addToast(t.proposedToast, 'success');
        announce(t.proposedToast);
        setOffered([]);
        setRequested([]);
        showSent();
      },
      {
        reload: () => Promise.all([load(), reloadSettings()]),
        onError: () => addToast(t.err_generic, 'error'),
      }
    );
    setBusy(null);
  }, [
    canSubmit,
    myCards,
    theirCards,
    partnerId,
    offered,
    requested,
    setBusy,
    addToast,
    announce,
    t,
    showSent,
    load,
    reloadSettings,
  ]);

  return {
    partners,
    partnerId,
    theirCards,
    theirError,
    myCards,
    offered,
    requested,
    canSubmit,
    load,
    choosePartner,
    togglePick,
    submit,
  };
}

export type TradeComposer = ReturnType<typeof useTradeComposer>;
