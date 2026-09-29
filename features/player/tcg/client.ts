// features/player/tcg/client.ts — appels typés de l'écran « Ma collection »
// (lot P14). Les URLs vivent ici.
//
// Routes « soi seulement » : aucune portée `?as=` n'est posée — une inspection
// staff les recevrait en 403 `subject_unsupported`.
//
// Les gestes qui touchent aux pièces (ouvrir, acheter, recycler) portent une
// `Idempotency-Key` : elle S'AJOUTE à la protection monétaire, qui reste EN
// BASE (réservation atomique, registre à clé unique, RPC) — jamais l'inverse.
// Une erreur HTTP lève `PlayerHttpError` (`code` stable, `payload` complet) ;
// l'écran relit l'état réel sur TOUTES les issues (`reloadAfterMutation`).

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  CollectionResponse,
  DrawnCard,
  PacksResponse,
  TradeSettingsPending,
  WalletResponse,
} from './model';
import type { TcgSetCompletedNotice } from '@/components/tcg/TcgSetsPanel';

export const tcgUrls = {
  collection: '/api/player/tcg/collection',
  packs: '/api/player/tcg/packs',
  booster: '/api/player/tcg/booster',
  recycle: '/api/player/tcg/recycle',
  wallet: '/api/player/tcg/wallet',
  tradeSettings: '/api/player/tcg/trades/settings',
};

/** `limit=` et, s'il y en a un, `&cursor=` (encodé ici). */
function page(limit: number, cursor: string | null) {
  return cursor
    ? `limit=${limit}&cursor=${encodeURIComponent(cursor)}`
    : `limit=${limit}`;
}

/** Réponse de l'ouverture : les cartes tirées, faces comprises. */
export type OpenPackResponse = {
  cards?: DrawnCard[];
  setsCompleted?: TcgSetCompletedNotice[];
} | null;

export const tcgClient = {
  collectionPage: (limit: number, cursor: string | null) =>
    playerRequest<CollectionResponse>(
      `${tcgUrls.collection}?${page(limit, cursor)}`
    ),
  /** Seulement les paquets FERMÉS : c'est tout ce que l'écran affiche. */
  unopenedPacks: (limit: number, cursor: string | null) =>
    playerRequest<PacksResponse>(
      `${tcgUrls.packs}?status=unopened&${page(limit, cursor)}`
    ),
  wallet: () => playerRequest<WalletResponse>(tcgUrls.wallet),
  tradeSettings: () =>
    playerRequest<TradeSettingsPending>(tcgUrls.tradeSettings),
  openPack: (packId: string) =>
    playerRequest<OpenPackResponse>(tcgUrls.packs, {
      method: 'POST',
      json: { packId },
      idempotent: true,
    }),
  buyBooster: () =>
    playerRequest<unknown>(tcgUrls.booster, {
      method: 'POST',
      idempotent: true,
    }),
  recycle: (target: { packId: string; position: number }) =>
    playerRequest<{ refund?: number } | null>(tcgUrls.recycle, {
      method: 'POST',
      json: target,
      idempotent: true,
    }),
};
