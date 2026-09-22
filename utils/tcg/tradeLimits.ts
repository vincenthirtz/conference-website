// utils/tcg/tradeLimits.ts
//
// Les plafonds chiffrés des échanges de cartes, seuls. Leur justification
// (parité, 72 h, anciennetés…) est dans l'en-tête de `./tradeRules`, qui les
// réexporte avec les schémas zod.
//
// Module feuille, sans aucun import : la page publique du guide
// (`pages/player/tcg-guide`) les affiche, et passer par `tradeRules` lui
// faisait embarquer zod.

export const TRADE_MAX_CARDS_PER_SIDE = 5;
export const TRADE_TTL_HOURS = 72;
export const TRADE_MAX_PENDING_SENT = 5;
export const TRADE_MAX_PENDING_RECEIVED = 10;
export const TRADE_DECLINE_COOLDOWN_HOURS = 24;
export const TRADE_MAX_ACCEPTED_PER_DAY = 3;
export const TRADE_MIN_ACCOUNT_AGE_DAYS = 14;
export const TRADE_MIN_COLLECTION_AGE_DAYS = 7;
