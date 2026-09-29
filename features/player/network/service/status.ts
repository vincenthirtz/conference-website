// features/player/network/service/status.ts — état d'onboarding réseau de la
// joueuse (Discord lié, BattleTag vérifié, découverte activée) (lot P15).
// Lu par la carte d'onboarding et le bandeau d'échéance ; jamais en
// inspection (les deux cartes y sont masquées, la route refuse `?as=`).

import { LegacyAdminError } from '@/utils/admin/errors';
import { getDiscordLinkForUser } from '@/utils/discordLinks';
import {
  listMemberships,
  pickExclusiveMembership,
} from '@/utils/teams/memberships';
import * as repo from '../repository';
import type { NetworkStatus } from '../schemas';
import type { NetworkCtx } from './context';

export async function readNetworkStatus(
  ctx: NetworkCtx
): Promise<NetworkStatus> {
  try {
    const [link, member, discovery] = await Promise.all([
      // `user_discord_links` est GLOBALE : un compte Discord est lié une fois
      // pour tous les tenants (helper canonique, colonne `auth_user_id`).
      getDiscordLinkForUser(ctx.userId),
      // Appartenance EXCLUSIVE : un siège de manager ne porte pas de BattleTag
      // et un manager peut en avoir plusieurs.
      listMemberships<{
        role: string | null;
        battle_tag: string | null;
        battle_tag_verified_at: string | null;
      }>(
        ctx.userId,
        ctx.tenantId,
        'role, battle_tag, battle_tag_verified_at'
      ).then(pickExclusiveMembership),
      repo.readDiscoverableFlag(ctx.db, ctx.userId),
    ]);

    const status: NetworkStatus = {
      discordLinked: !!link,
      hasTeam: !!member,
      battleTagSet: !!member?.battle_tag,
      battleTagVerified: !!member?.battle_tag_verified_at,
      discoverable: discovery.discoverable,
      missingCount: 0,
    };
    // Le BattleTag ne manque que pour une joueuse EN équipe.
    status.missingCount =
      (status.discordLinked ? 0 : 1) +
      (status.hasTeam && !status.battleTagVerified ? 1 : 0) +
      (status.discoverable ? 0 : 1);
    return status;
  } catch (err) {
    ctx.logger.error('[network-status] crash', err);
    throw new LegacyAdminError(500, 'Lecture impossible.');
  }
}
