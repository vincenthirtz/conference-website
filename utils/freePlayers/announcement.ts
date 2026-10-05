// utils/freePlayers/announcement.ts
//
// Le cycle de vie de l'ANNONCE DISCORD d'une fiche « joueuse libre ».
//
// LE PROBLÈME. Le bot annonce chaque inscription web dans le salon de
// recrutement (`free_player.registered`). Retrait, péremption, suppression par
// le staff : rien ne retirait le message. Le salon continuait de présenter
// comme disponible une joueuse partie depuis des semaines — et une capitaine
// qui la contactait tombait dans le vide.
//
// LE MÉCANISME (même principe que l'ancrage du vote MVP public) : le bot
// renvoie au site où il a posté (`POST /api/bot/v1/free-players/announcement`),
// le site garde `discord_announce_{channel,message}_id`, et c'est LUI qui
// demande la suppression (`free_player.withdrawn`) quand la fiche s'en va. Le
// bot ne tient aucun état : il oublie le message dès qu'il l'a posté.
//
// NE LÈVE JAMAIS. Retirer l'annonce est un nettoyage : un échec ne doit faire
// échouer ni un retrait, ni une suppression staff, ni un passage de cron.

import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

export type WithdrawReason = 'removed' | 'expired' | 'admin';

export type AnnouncedRow = {
  id: string;
  tenant_id?: string | null;
  discord_announce_channel_id?: string | null;
  discord_announce_message_id?: string | null;
};

/** Colonnes à lire pour pouvoir appeler `requestAnnouncementWithdrawal`. */
export const ANNOUNCEMENT_SELECT =
  'id, tenant_id, discord_announce_channel_id, discord_announce_message_id';

/**
 * Demande au bot de supprimer l'annonce de cette fiche, si elle en a une.
 * Renvoie `true` si une demande est partie (l'appelant peut alors effacer
 * l'ancrage), `false` s'il n'y avait rien à retirer ou si l'émission a échoué.
 *
 * L'event passe par l'outbox : un bot hors ligne le rattrape au redémarrage.
 * Clé d'idempotence = la fiche + le message — deux demandes pour la même
 * annonce n'en font qu'une côté bot.
 */
export async function requestAnnouncementWithdrawal(
  row: AnnouncedRow,
  reason: WithdrawReason
): Promise<boolean> {
  const channelId = row.discord_announce_channel_id;
  const messageId = row.discord_announce_message_id;
  const tenantId = row.tenant_id;
  if (!channelId || !messageId || !tenantId) return false;

  try {
    const result = await emitBotEvent(
      'free_player.withdrawn',
      { freePlayerId: row.id, channelId, messageId, reason },
      tenantId,
      { idempotencyKey: `free_player.withdrawn:${row.id}:${messageId}` }
    );
    // Un push raté n'est PAS un échec : l'outbox le rattrape. Seul compte
    // l'événement perdu (ni ligne d'outbox, ni push abouti).
    const lost =
      result.error === 'missing_tenant_id' ||
      (result.error ?? '').startsWith('event_lost');
    return !lost;
  } catch (err) {
    logger.error('[freePlayers/announcement] withdrawal emit failed', err);
    return false;
  }
}
