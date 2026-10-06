// utils/teams/captainMessageNotify.ts
//
// « Une équipe t'a écrit » — prévenir les personnes qui RÉPONDENT au nom de
// l'équipe destinataire d'un message entre capitaines.
//
// POURQUOI. Le message était écrit en base (`demandes`, type
// `captain_message`) et c'est tout : ni push, ni DM, ni email. La capitaine ne
// le découvrait qu'en ouvrant d'elle-même /player/messages — une demande de
// scrim, un « on décale ? » restaient sans réponse des jours.
//
// AUDIENCE. Les détentrices de `send_captain_messages` sur l'équipe
// DESTINATAIRE — exactement celles qui peuvent répondre. Même résolution que
// `getManagedTeams` (utils/teams/managementAccess.ts), lue côté équipe :
//   - la capitaine (`teams.captain_id`) ;
//   - les membres dont le rôle (config `site_settings.team_roles` du tenant)
//     accorde la permission ;
//   - les délégations actives (`team_member_permissions`, non révoquées).
// L'expéditrice est retirée (elle peut gérer les deux équipes).
//
// UN ÉVÉNEMENT, DEUX CANAUX. `captain.message` part dans l'outbox bot :
//   - le dispatcher Web Push le pousse aux seules `recipientUserIds`, staff
//     exclu (cf. web-push-dispatch) ;
//   - le bot peut en faire un DM à chaque `recipients[].discordUserId`.
//
// CONFIDENTIALITÉ. Le CONTENU du message ne part jamais : une notification se
// lit sur un écran verrouillé, un DM dans un client partagé. Seuls le nom de
// l'équipe émettrice et le lien vers la messagerie sortent.
//
// PRÉFÉRENCES. `captain.message` figure au catalogue joueuse
// (PLAYER_PUSH_EVENT_TYPES), modèle OPT-OUT. Une destinataire qui l'a coupé
// est retirée AVANT l'émission : ni push, ni DM. Si plus personne ne reste,
// rien n'est émis.
//
// NE LÈVE JAMAIS : le message est déjà écrit quand on arrive ici.

import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { logger } from '@/utils/logger';
import { loadOptedOutUserIds } from '@/utils/notificationAudience';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { supabaseAdmin } from '@/utils/supabase';
import {
  loadTeamRolesFromSupabase,
  roleHasPermission,
} from '@/utils/teamRoles';

export const CAPTAIN_MESSAGE_EVENT = 'captain.message' as const;

/** La messagerie entre capitaines. */
export const CAPTAIN_MESSAGE_PLAYER_PATH = '/player/messages';

const PERMISSION = 'send_captain_messages' as const;

/**
 * Comptes pouvant répondre au nom de `teamId` (permission
 * `send_captain_messages`). Une lecture en échec est journalisée et ignorée :
 * on préfère prévenir moins de monde que pas du tout. Ne lève jamais.
 */
export async function loadCaptainMessageRecipients(
  teamId: string,
  tenantId: string
): Promise<string[]> {
  if (!teamId || !supabaseAdmin) return [];
  const out = new Set<string>();

  const [teamRes, membersRes, grantsRes, roles] = await Promise.all([
    supabaseAdmin
      .from('teams')
      .select('captain_id')
      .eq('id', teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('team_member_permissions')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
      .eq('permission', PERMISSION)
      .is('revoked_at', null),
    loadTeamRolesFromSupabase(supabaseAdmin, tenantId),
  ]);

  if (teamRes.error) {
    logger.error('[captainMessageNotify] team lookup error', teamRes.error);
  } else {
    const captainId = (teamRes.data as { captain_id?: string | null } | null)
      ?.captain_id;
    if (captainId) out.add(captainId);
  }

  if (membersRes.error) {
    logger.error(
      '[captainMessageNotify] members lookup error',
      membersRes.error
    );
  } else {
    for (const r of (membersRes.data ?? []) as Array<{
      user_id: string | null;
      role: string | null;
    }>) {
      if (r.user_id && roleHasPermission(roles, r.role, PERMISSION)) {
        out.add(r.user_id);
      }
    }
  }

  if (grantsRes.error) {
    logger.error('[captainMessageNotify] grants lookup error', grantsRes.error);
  } else {
    for (const r of (grantsRes.data ?? []) as Array<{
      user_id: string | null;
    }>) {
      if (r.user_id) out.add(r.user_id);
    }
  }

  return Array.from(out);
}

export type CaptainMessageAnnouncement = {
  tenantId: string;
  /** L'expéditrice — jamais notifiée de son propre message. */
  senderUserId: string;
  conversationId: string;
  fromTeamId: string;
  fromTeamName: string;
  toTeamId: string;
  toTeamName: string;
};

/**
 * Émet `captain.message` vers les destinataires de l'équipe cible. Renvoie la
 * liste des destinataires annoncées (vide = rien émis) — utile au test, jamais
 * à la réponse HTTP.
 */
export async function announceCaptainMessage(
  input: CaptainMessageAnnouncement
): Promise<string[]> {
  try {
    const candidates = (
      await loadCaptainMessageRecipients(input.toTeamId, input.tenantId)
    ).filter((u) => u !== input.senderUserId);
    if (candidates.length === 0) return [];

    const optedOut = await loadOptedOutUserIds(
      candidates,
      CAPTAIN_MESSAGE_EVENT
    );
    const recipientUserIds = candidates.filter((u) => !optedOut.has(u));
    if (recipientUserIds.length === 0) return [];

    const links = await getDiscordLinksForUsers(recipientUserIds);
    await emitBotEvent(
      CAPTAIN_MESSAGE_EVENT,
      {
        conversationId: input.conversationId,
        fromTeamId: input.fromTeamId,
        fromTeamName: input.fromTeamName,
        toTeamId: input.toTeamId,
        toTeamName: input.toTeamName,
        recipientUserIds,
        recipients: recipientUserIds.map((userId) => {
          const link = links.get(userId) ?? null;
          return {
            userId,
            discordUserId: link?.discordUserId ?? null,
            discordUsername: link?.discordUsername ?? null,
          };
        }),
        // Absolue : ce lien part aussi dans un DM. Le push, lui, route via
        // playerUrlForEvent.
        ctaUrl: absoluteSiteUrl(CAPTAIN_MESSAGE_PLAYER_PATH),
      },
      input.tenantId
    );
    return recipientUserIds;
  } catch (err) {
    logger.error(
      '[captainMessageNotify] annonce non émise: %s',
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}
