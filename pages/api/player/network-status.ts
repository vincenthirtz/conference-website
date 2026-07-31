// pages/api/player/network-status.ts
//
// GET — ce qui manque à une joueuse pour EXISTER dans le réseau (R11 + R12).
//
// Constat qui motive cette route (prod, 2026-07-31) : 6 comptes Discord liés
// sur 38, 3 BattleTags vérifiés sur 19 membres d'équipe, 0 profil découvrable.
// Or presque tout le réseau repose sur ces liaisons :
//   - `user_discord_links` conditionne role-sync, salons d'équipe, invitations
//     et notifications Discord — sans lui, la joueuse est un nœud mort ;
//   - le BattleTag vérifié est ce qui rend un roster crédible (et il alimente
//     le rating, cf. l'écran de couverture admin) ;
//   - la découverte opt-in n'a jamais été proposée au bon moment.
//
// La route ne fait que CONSTATER : elle ne pousse rien, n'écrit rien. L'UI
// décide quoi proposer, et l'utilisatrice reste libre de tout ignorer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';

export type NetworkStatus = {
  /** Compte Discord lié (table globale user_discord_links). */
  discordLinked: boolean;
  /** Membre d'une équipe (le BattleTag n'a de sens que dans ce cadre). */
  hasTeam: boolean;
  /** BattleTag renseigné sur la fiche de membre. */
  battleTagSet: boolean;
  /** BattleTag vérifié via Battle.net OAuth. */
  battleTagVerified: boolean;
  /** Profil de découverte activé (opt-in global, invisible par défaut). */
  discoverable: boolean;
  /** Nombre d'étapes non faites — 0 = rien à proposer. */
  missingCount: number;
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NetworkStatus | { error: string }>,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'network-status')
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  try {
    const [linkRes, memberRes, discoveryRes] = await Promise.all([
      // `user_discord_links` est GLOBALE (pas de tenant_id) : un compte Discord
      // est lié une fois, pour tous les tenants.
      supabaseAdmin
        .from('user_discord_links')
        .select('discord_user_id')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select('battle_tag, battle_tag_verified_at')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('player_discovery_profiles')
        .select('discoverable')
        .eq('auth_user_id', user.id)
        .maybeSingle(),
    ]);

    const member = memberRes.data as {
      battle_tag: string | null;
      battle_tag_verified_at: string | null;
    } | null;

    const status: NetworkStatus = {
      discordLinked: !!linkRes.data,
      hasTeam: !!member,
      battleTagSet: !!member?.battle_tag,
      battleTagVerified: !!member?.battle_tag_verified_at,
      discoverable: Boolean(
        (discoveryRes.data as { discoverable?: boolean } | null)?.discoverable
      ),
      missingCount: 0,
    };

    // Le BattleTag n'est compté comme manquant que pour une joueuse EN équipe :
    // le réclamer à quelqu'un sans équipe n'a aucun sens.
    status.missingCount =
      (status.discordLinked ? 0 : 1) +
      (status.hasTeam && !status.battleTagVerified ? 1 : 0) +
      (status.discoverable ? 0 : 1);

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json(status);
  } catch (err) {
    logger.error('[network-status] crash', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
});
