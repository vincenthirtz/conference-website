// features/player/tcg/hooks/useTcgHome.ts — état et lectures de « Ma
// collection » (lot P14, extrait de pages/player/tcg.tsx, même comportement).
//
// LES CARTES SONT RELUES, JAMAIS MISES EN CACHE au-delà de l'affichage
// courant : c'est ce qui fait qu'un retrait de consentement retire une photo
// des cartes déjà distribuées (la face vient du serveur à chaque lecture).
//
// UNE LECTURE RATÉE N'EST PAS UNE COLLECTION VIDE NI UN SOLDE À 0 :
// `loading` → `ready` | `error`. Jamais affichée : l'écran d'erreur. Déjà
// affichée : on garde l'écran et on prévient.
//
// LA COLLECTION ET LES PAQUETS SONT PAGINÉS (curseur rendu par l'API). Un
// rechargement après une action redemande AU MOINS autant de cartes qu'il y en
// avait à l'écran : revenir à la première page ferait disparaître ce qu'on
// regardait.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { tcgClient } from '../client';
import {
  subjectKey,
  type CollectionCard,
  type CollectionResponse,
  type Earn,
  type Pack,
  type PacksResponse,
} from '../model';

/** Paquets à ouvrir par page ; au-delà, « voir les autres ». */
export const PACKS_PAGE = 24;
/** Cartes par page : huit rangées sur la grille à cinq colonnes. */
export const COLLECTION_PAGE = 40;
/** Plafond d'une page côté API (`MAX_PAGE_LIMIT`). */
const API_MAX_LIMIT = 200;

export type LoadState = 'loading' | 'ready' | 'error';
export type TcgBusy = string | null;

export function useTcgHome() {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadedOnceRef = useRef(false);

  const [packs, setPacks] = useState<Pack[]>([]);
  const [unopenedCount, setUnopenedCount] = useState(0);
  const [packsCursor, setPacksCursor] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  // Prix et remboursement viennent de l'API : `null` tant qu'inconnus, et le
  // bouton correspondant reste alors ABSENT (jamais « — pièces »).
  const [boosterPrice, setBoosterPrice] = useState<number | null>(null);
  const [recycleRefund, setRecycleRefund] = useState<number | null>(null);
  const [earn, setEarn] = useState<Earn | null>(null);

  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [collectionCursor, setCollectionCursor] = useState<string | null>(null);
  const [totals, setTotals] = useState({ distinct: 0, total: 0 });
  // Séparé de `totals` : le vivier peut manquer alors que la collection est
  // lisible (`null` ⇒ barre masquée, jamais « 12 sur 0 »).
  const [pool, setPool] = useState<{ distinct: number } | null>(null);
  const [busy, setBusy] = useState<TcgBusy>(null);

  /** Au moins `atLeast` cartes, en suivant les curseurs. */
  const fetchCollection = useCallback(async (atLeast: number) => {
    const acc: CollectionCard[] = [];
    let cursor: string | null = null;
    let last: CollectionResponse | null = null;
    do {
      const size = Math.min(
        API_MAX_LIMIT,
        Math.max(COLLECTION_PAGE, atLeast - acc.length)
      );
      const pageData: CollectionResponse = await tcgClient.collectionPage(
        size,
        cursor
      );
      acc.push(...(pageData.cards ?? []));
      last = pageData;
      cursor = pageData.nextCursor ?? null;
    } while (cursor && acc.length < atLeast);
    return { cards: acc, last, cursor };
  }, []);

  const applyPacks = useCallback((data: PacksResponse, append: boolean) => {
    setPacks((prev) => {
      const incoming = data.packs ?? [];
      if (!append) return incoming;
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...incoming.filter((p) => !seen.has(p.id))];
    });
    setPacksCursor(data.nextCursor ?? null);
    setBalance(data.balance ?? 0);
    setUnopenedCount(
      typeof data.unopened === 'number'
        ? data.unopened
        : (data.packs ?? []).filter((p) => !p.openedAt).length
    );
    if (typeof data.boosterPrice === 'number') {
      setBoosterPrice(data.boosterPrice);
    }
    if (typeof data.recycleRefund === 'number') {
      setRecycleRefund(data.recycleRefund);
    }
    if (
      typeof data.earn?.matchWin === 'number' &&
      typeof data.earn?.scrimWin === 'number'
    ) {
      setEarn(data.earn);
    }
  }, []);

  const applyCollectionMeta = useCallback((pageData: CollectionResponse) => {
    setPool(
      pageData.pool && typeof pageData.pool.distinct === 'number'
        ? pageData.pool
        : null
    );
    setTotals({ distinct: pageData.distinct ?? 0, total: pageData.total ?? 0 });
  }, []);

  /** Recharge paquets et collection ; `keepCards` = cartes déjà affichées. */
  const load = useCallback(
    async (keepCards = 0) => {
      try {
        const [packsData, coll] = await Promise.all([
          tcgClient.unopenedPacks(PACKS_PAGE, null),
          fetchCollection(keepCards),
        ]);
        applyPacks(packsData, false);
        setCards(coll.cards);
        setCollectionCursor(coll.cursor);
        if (coll.last) applyCollectionMeta(coll.last);
        loadedOnceRef.current = true;
        setLoadState('ready');
      } catch {
        if (loadedOnceRef.current) {
          addToast(t.loadMoreError, 'error');
        } else {
          setLoadState('error');
        }
      }
    },
    [fetchCollection, applyPacks, applyCollectionMeta, addToast, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const retryLoad = useCallback(() => {
    setLoadState('loading');
    void load();
  }, [load]);

  const loadMorePacks = useCallback(async () => {
    if (!packsCursor) return;
    setBusy('more-packs');
    try {
      applyPacks(await tcgClient.unopenedPacks(PACKS_PAGE, packsCursor), true);
    } catch {
      addToast(t.loadMoreError, 'error');
    } finally {
      setBusy(null);
    }
  }, [addToast, applyPacks, packsCursor, t]);

  /**
   * Page suivante de la collection. Rend le nombre de cartes AVANT l'ajout
   * (l'écran y pose le focus), ou `null` en cas d'échec.
   */
  const loadMoreCards = useCallback(async (): Promise<number | null> => {
    if (!collectionCursor) return null;
    setBusy('more-cards');
    const before = cards.length;
    try {
      const pageData = await tcgClient.collectionPage(
        COLLECTION_PAGE,
        collectionCursor
      );
      setCards((prev) => {
        const seen = new Set(prev.map(subjectKey));
        return [
          ...prev,
          ...(pageData.cards ?? []).filter((c) => !seen.has(subjectKey(c))),
        ];
      });
      setCollectionCursor(pageData.nextCursor ?? null);
      applyCollectionMeta(pageData);
      return before;
    } catch {
      addToast(t.loadMoreError, 'error');
      return null;
    } finally {
      setBusy(null);
    }
  }, [addToast, applyCollectionMeta, cards.length, collectionCursor, t]);

  return {
    loadState,
    packs,
    unopenedCount,
    packsCursor,
    balance,
    boosterPrice,
    recycleRefund,
    earn,
    cards,
    collectionCursor,
    totals,
    pool,
    busy,
    setBusy,
    load,
    retryLoad,
    loadMorePacks,
    loadMoreCards,
  };
}

export type TcgHome = ReturnType<typeof useTcgHome>;
