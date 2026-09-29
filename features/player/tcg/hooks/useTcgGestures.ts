// features/player/tcg/hooks/useTcgGestures.ts — les gestes qui touchent aux
// pièces : ouvrir un paquet, acheter un booster, recycler un doublon (lot P14,
// extraits de pages/player/tcg.tsx, mêmes refus traduits, même relecture).
//
// AUCUNE RÈGLE MONÉTAIRE ICI. Le débit, le crédit et « une seule fois » sont
// tenus EN BASE (réservation atomique, registre à clé unique, RPC) ; l'écran
// ne fait qu'envoyer le geste puis RELIRE L'ÉTAT RÉEL sur toutes les issues,
// `catch` compris (`reloadAfterMutation`) : si la réponse se perd après le
// débit, ne pas relire laissait l'ancien solde à l'écran — la joueuse
// recliquait et payait un second paquet. Le bouton reste bloqué (`busy`)
// jusqu'à ce que l'état relu soit affiché.

import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import type { TcgSetCompletedNotice } from '@/components/tcg/TcgSetsPanel';
import type { TcgRarity } from '@/utils/tcg/rarity';
import { reloadAfterMutation } from '@/utils/tcg/reloadAfterMutation';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import { tcgClient } from '../client';
import { cardName, type CollectionCard, type DrawnCard } from '../model';
import type { TcgHome } from './useTcgHome';

/** Le code stable d'un refus HTTP, `null` pour une panne (réseau…). */
function refusalOf(
  err: unknown
): { code: string | null; body: unknown } | null {
  return err instanceof PlayerHttpError
    ? { code: err.code, body: err.payload }
    : null;
}

export function useTcgGestures(
  home: TcgHome,
  rarityLabel: Record<TcgRarity, string>
) {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();
  const { load, setBusy, cards, recycleRefund } = home;

  // Les cartes du dernier paquet ouvert. `id` = clé de montage : ouvrir un
  // second paquet REJOUE l'apparition et le déplacement du focus.
  const [revealed, setRevealed] = useState<{
    id: string;
    cards: DrawnCard[];
  } | null>(null);
  // Les séries que la dernière ouverture vient de compléter (récompense écrite
  // À CE MOMENT-LÀ : c'est cette réponse qui le dit).
  const [setsCompleted, setSetsCompleted] = useState<
    TcgSetCompletedNotice[] | null
  >(null);
  // Région `aria-live` montée VIDE en permanence : vider d'abord, sinon deux
  // annonces identiques ne diraient rien.
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const reloadKeeping = useCallback(() => load(cards.length), [load, cards]);

  const openPack = useCallback(
    async (packId: string) => {
      setBusy(packId);
      await reloadAfterMutation(
        async () => {
          let body: Awaited<ReturnType<typeof tcgClient.openPack>>;
          try {
            body = await tcgClient.openPack(packId);
          } catch (err) {
            const refusal = refusalOf(err);
            if (!refusal) throw err;
            addToast(
              refusal.code === 'already_opened'
                ? t.errAlreadyOpened
                : refusal.code === 'empty_pool'
                  ? t.errEmptyPool
                  : t.errGeneric,
              'error'
            );
            return;
          }
          // Une réponse illisible n'est pas une erreur d'ouverture : le paquet
          // EST ouvert, on se rabat sur la relecture sans rien annoncer de faux.
          if (
            Array.isArray(body?.setsCompleted) &&
            body.setsCompleted.length > 0
          ) {
            setSetsCompleted(body.setsCompleted);
          }
          if (Array.isArray(body?.cards) && body.cards.length > 0) {
            const drawn = [...body.cards].sort(
              (a, b) => a.position - b.position
            );
            setRevealed({ id: packId, cards: drawn });
            announce(
              format(t.revealAnnounce, {
                cards: drawn
                  .map((c) => {
                    const parts = [
                      format(t.revealAnnounceCard, {
                        name: cardName(c) ?? t.revealUnnamed,
                        rarity: rarityLabel[c.rarity],
                      }),
                    ];
                    if (c.isFoil) parts.push(t.revealAnnounceFoil);
                    if (c.isNew === true) parts.push(t.revealAnnounceNew);
                    if (c.isNew === false)
                      parts.push(t.revealAnnounceDuplicate);
                    return parts.join(', ');
                  })
                  .join(' ; '),
              })
            );
          }
        },
        {
          reload: reloadKeeping,
          onError: () => addToast(t.errGeneric, 'error'),
        }
      );
      setBusy(null);
    },
    [addToast, announce, rarityLabel, reloadKeeping, setBusy, t]
  );

  const buyBooster = useCallback(async () => {
    setBusy('buy');
    await reloadAfterMutation(
      async () => {
        try {
          await tcgClient.buyBooster();
        } catch (err) {
          const refusal = refusalOf(err);
          if (!refusal) throw err;
          const price = (refusal.body as { price?: number } | null)?.price;
          addToast(
            refusal.code === 'insufficient_funds'
              ? format(t.errInsufficientFunds, { price: price ?? '' })
              : refusal.code === 'balance_changed'
                ? t.errBalanceChanged
                : t.errGeneric,
            'error'
          );
          return;
        }
        addToast(t.buySuccess, 'success');
      },
      {
        reload: reloadKeeping,
        onError: () => addToast(t.errGeneric, 'error'),
      }
    );
    setBusy(null);
  }, [addToast, reloadKeeping, setBusy, t]);

  /**
   * Recycler un doublon DÉJÀ CONFIRMÉ par l'écran. La route marque la carte
   * AVANT de créditer et relâche le marquage si le crédit échoue : on relit
   * donc même après un échec, pour montrer l'état réel.
   */
  const recycleCard = useCallback(
    async (card: CollectionCard) => {
      const target = card.recyclable;
      if (!target || recycleRefund === null) return;
      setBusy(`recycle:${target.packId}:${target.position}`);
      await reloadAfterMutation(
        async () => {
          let body: Awaited<ReturnType<typeof tcgClient.recycle>>;
          try {
            body = await tcgClient.recycle(target);
          } catch (err) {
            const refusal = refusalOf(err);
            if (!refusal) throw err;
            addToast(
              refusal.code === 'not_a_duplicate'
                ? t.errNotADuplicate
                : refusal.code === 'already_recycled'
                  ? t.errAlreadyRecycled
                  : t.errGeneric,
              'error'
            );
            return;
          }
          addToast(
            format(t.recycleSuccess, {
              refund: body?.refund ?? recycleRefund,
            }),
            'success'
          );
        },
        {
          reload: reloadKeeping,
          onError: () => addToast(t.errGeneric, 'error'),
        }
      );
      setBusy(null);
    },
    [addToast, recycleRefund, reloadKeeping, setBusy, t]
  );

  return {
    revealed,
    dismissReveal: () => setRevealed(null),
    setsCompleted,
    announcement,
    openPack,
    buyBooster,
    recycleCard,
  };
}
