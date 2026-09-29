// features/player/linked-accounts/schemas.ts — contrats des comptes liés de
// la joueuse (lot P9) : Twitch (identité OAuth) et Battle.net (BattleTag
// vérifié). Types seuls : aucun corps à valider (GET / DELETE).
//
// Les redirections OAuth (`/api/auth/twitch/start`, `/api/auth/battlenet/start`)
// et leurs callbacks ne passent PAS par ce module : ils restent tels quels.

import type { BattlenetRewardOffer } from '../../../utils/tcg/battlenetRewardDisplay';

/** Réponse de GET et DELETE /api/player/twitch-status. */
export type TwitchLinkStatus = {
  configured: boolean;
  linked: boolean;
  twitchLogin: string | null;
  linkedAt: string | null;
};

/** Réponse de GET /api/player/battlenet-status. */
export type BattlenetStatus = {
  configured: boolean;
  linked: boolean;
  battleTag: string | null;
  verifiedAt: string | null;
  /** Additif : absent d'une API plus ancienne, `null` si non activée. */
  reward?: BattlenetRewardOffer | null;
};

/**
 * URLs des routes. Ici plutôt que dans un `client.ts` : les cartes servent
 * aussi dans la modale profil de l'admin, montée par la barre de navigation
 * de TOUTES les pages — seul `schemas.ts` d'un module joueuse peut entrer
 * dans le bundle public (tests/unit/adminBoundariesGuard.test.ts).
 */
export const linkedAccountsUrls = {
  twitch: '/api/player/twitch-status',
  battlenet: '/api/player/battlenet-status',
} as const;
