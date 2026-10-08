// features/admin/twitch/client.ts — chemins des points de chaîne Twitch
// (Diffusion › Overlays › « Récompenses »).
//
// MÉCANIQUE INCHANGÉE, comme `casterPaths` : le panneau garde ses appels
// `useAdminFetch` / `useIdempotentMutation` (état local, pas de cache de
// requêtes). Seules les URLs sortent du composant, pour qu'il n'en écrive
// plus aucune en dur (cliquet `ui.rawAdminUrl`).
//
// Contrat des routes : features/admin/twitch/routes/{rewards,rewardById,
// redemptions}.ts.

const TWITCH = '/api/admin/twitch';
const REWARDS = `${TWITCH}/channel-points/rewards`;
const REDEMPTIONS = `${TWITCH}/channel-points/redemptions`;

export const twitchPaths = {
  /** GET → { connected, broadcaster_login? } */
  connection: `${TWITCH}/connection`,
  /** GET → { rewards } (celles de l'app) ; POST crée une récompense. */
  rewards: REWARDS,
  /** GET → { rewards } : TOUTES les récompenses de la chaîne. */
  allRewards: `${REWARDS}?all=1`,
  /** PATCH / DELETE d'une récompense de l'app. */
  reward: (id: string) => `${REWARDS}/${encodeURIComponent(id)}`,
  /** PATCH { reward_id, redemption_ids, status } */
  redemptions: REDEMPTIONS,
  /** GET → { redemptions } : échanges en attente d'une récompense. */
  pendingRedemptions: (rewardId: string) =>
    `${REDEMPTIONS}?reward_id=${encodeURIComponent(rewardId)}&status=UNFULFILLED`,
} as const;
