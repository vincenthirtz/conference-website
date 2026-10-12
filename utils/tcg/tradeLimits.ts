// utils/tcg/tradeLimits.ts
//
// Les plafonds chiffrés des échanges de cartes, seuls. Leur justification
// (parité, expiration, anciennetés…) est dans l'en-tête de `./tradeRules`, qui les
// réexporte avec les schémas zod.
//
// Module feuille, sans aucun import : la page publique du guide
// (`pages/player/tcg-guide`) les affiche, et passer par `tradeRules` lui
// faisait embarquer zod.

export const TRADE_MAX_CARDS_PER_SIDE = 5;
export const TRADE_TTL_HOURS = 168;
export const TRADE_MAX_PENDING_SENT = 10;
export const TRADE_MAX_PENDING_RECEIVED = 20;
export const TRADE_DECLINE_COOLDOWN_HOURS = 24;
export const TRADE_MAX_ACCEPTED_PER_DAY = 6;
export const TRADE_MIN_ACCOUNT_AGE_DAYS = 14;
export const TRADE_MIN_COLLECTION_AGE_DAYS = 7;
