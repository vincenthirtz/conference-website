// features/player/linked-accounts/service.ts — état des comptes liés de la
// joueuse (lot P9). Reprise à l'identique de pages/api/player/{twitch-status,
// battlenet-status}.ts. Les liens eux-mêmes vivent dans utils/auth/*Links
// (partagés avec les callbacks OAuth et le bot) : pas de repository propre.

import { LegacyAdminError } from '@/utils/admin/errors';
import { isTwitchIdentityConfigured } from '@/utils/twitchIdentity';
import {
  deleteTwitchLink,
  getTwitchLinkStatus,
} from '@/utils/auth/twitchLinks';
import { isBattlenetConfigured } from '@/utils/battlenet';
import { getBattlenetLinkStatus } from '@/utils/auth/battlenetLinks';
import { readBattlenetRewardOffer } from '@/utils/tcg/grantBattlenetVerified';
import type { BattlenetStatus, TwitchLinkStatus } from './schemas';

export async function readTwitchLink(
  userId: string
): Promise<TwitchLinkStatus> {
  const status = await getTwitchLinkStatus(userId);
  return {
    configured: isTwitchIdentityConfigured(),
    linked: status.linked,
    twitchLogin: status.twitchLogin,
    linkedAt: status.linkedAt,
  };
}

/** Retire le lien Twitch ; rend l'état « non lié ». */
export async function unlinkTwitch(userId: string): Promise<TwitchLinkStatus> {
  const ok = await deleteTwitchLink(userId);
  if (!ok) throw new LegacyAdminError(500, 'Suppression impossible.');
  return {
    configured: isTwitchIdentityConfigured(),
    linked: false,
    twitchLogin: null,
    linkedAt: null,
  };
}

export async function readBattlenetLink(
  userId: string
): Promise<BattlenetStatus> {
  const [status, reward] = await Promise.all([
    getBattlenetLinkStatus(userId),
    readBattlenetRewardOffer(userId),
  ]);
  return {
    configured: isBattlenetConfigured(),
    linked: status.linked,
    battleTag: status.battleTag,
    verifiedAt: status.verifiedAt,
    reward,
  };
}
