// features/player/tcg/client.ts — appels typés de l'écran « Ma collection »
// (lot P14) et de ses panneaux autonomes (forge, habillages, vitrine, séries,
// fan-art, photo, retrait, cadeau d'accueil). Les URLs vivent ici.
//
// Routes « soi seulement » : aucune portée `?as=` n'est posée — une inspection
// staff les recevrait en 403 `subject_unsupported`. Seule exception : la
// LECTURE du cadeau d'accueil (`follow`), qui suit le sujet inspecté.
//
// Les panneaux gardent leurs propres types de réponse (paramètre `T`) : ils
// sont définis à côté de l'écran qui les lit.
//
// Les gestes qui touchent aux pièces (ouvrir, acheter, recycler) portent une
// `Idempotency-Key` : elle S'AJOUTE à la protection monétaire, qui reste EN
// BASE (réservation atomique, registre à clé unique, RPC) — jamais l'inverse.
// Une erreur HTTP lève `PlayerHttpError` (`code` stable, `payload` complet) ;
// l'écran relit l'état réel sur TOUTES les issues (`reloadAfterMutation`).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type {
  EquipCosmeticsInput,
  FanartSubmitInput,
  PlayerWelcomeClaimResponse,
  PlayerWelcomeGiftResponse,
  ShowcaseInput,
} from './schemas';
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
  forge: '/api/player/tcg/forge',
  cosmetics: '/api/player/tcg/cosmetics',
  showcase: '/api/player/tcg/showcase',
  sets: '/api/player/tcg/sets',
  fanart: '/api/player/tcg/fanart',
  photo: '/api/player/tcg/photo',
  exclusion: '/api/player/tcg/exclusion',
  welcomeGift: '/api/player/tcg/welcome-gift',
};

/** Sujet inspecté seul (`?as=`), sans l'équipe active. */
const subjectOnly = (s: PlayerScope): PlayerScope => ({ ...s, teamId: null });

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
  /** Forge : débit en base (RPC `tcg_forge_card`) ; la clé s'y AJOUTE. */
  forge: (cards: unknown[]) =>
    playerRequest<{ rarity?: string } | null>(tcgUrls.forge, {
      method: 'POST',
      json: { cards },
      idempotent: true,
    }),
  cosmetics: <T>() => playerRequest<T>(tcgUrls.cosmetics),
  /** Achat : débit en base (RPC `tcg_buy_cosmetic`). */
  buyCosmetic: (key: string) =>
    playerRequest<unknown>(tcgUrls.cosmetics, {
      method: 'POST',
      json: { key },
      idempotent: true,
    }),
  equipCosmetics: (patch: EquipCosmeticsInput) =>
    playerRequest<unknown>(tcgUrls.cosmetics, {
      method: 'PUT',
      json: patch,
      idempotent: true,
    }),
  showcase: <T>() => playerRequest<T>(tcgUrls.showcase),
  saveShowcase: <T>(body: ShowcaseInput) =>
    playerRequest<T>(tcgUrls.showcase, {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  sets: <T>() => playerRequest<T>(tcgUrls.sets),
  fanart: <T>() => playerRequest<T>(tcgUrls.fanart),
  /** Route hors noyau (téléversement base64) : pas d'`Idempotency-Key`. */
  submitFanart: (body: FanartSubmitInput) =>
    playerRequest<unknown>(tcgUrls.fanart, { method: 'POST', json: body }),
  withdrawFanart: (id: string) =>
    playerRequest<unknown>(`${tcgUrls.fanart}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  photo: <T>() => playerRequest<T>(tcgUrls.photo),
  exclusion: <T>() => playerRequest<T>(tcgUrls.exclusion),
  /** `true` = se retirer (POST), `false` = revenir (DELETE). */
  setExclusion: (excluded: boolean) =>
    playerRequest<unknown>(tcgUrls.exclusion, {
      method: excluded ? 'POST' : 'DELETE',
      idempotent: true,
    }),
  /** Lecture `follow` : suit le sujet inspecté (jamais l'équipe). */
  welcomeGift: (scope: PlayerScope) =>
    playerRequest<PlayerWelcomeGiftResponse>(tcgUrls.welcomeGift, {
      scope: subjectOnly(scope),
      skipAuthRedirect: true,
    }),
  /** Réclamation : toujours pour SOI (aucune portée). */
  claimWelcomeGift: () =>
    playerRequest<PlayerWelcomeClaimResponse>(tcgUrls.welcomeGift, {
      method: 'POST',
      skipAuthRedirect: true,
      idempotent: true,
    }),
};
