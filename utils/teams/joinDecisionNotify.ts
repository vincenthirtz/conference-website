// utils/teams/joinDecisionNotify.ts
//
// « Ta candidature a été acceptée / refusée » — prévenir la CANDIDATE de la
// décision prise sur sa demande d'adhésion (ou de transfert).
//
// POURQUOI. La décision était écrite en base et c'est tout : aucun canal ne la
// portait. La joueuse ne l'apprenait qu'en revenant d'elle-même sur son
// tableau de bord — et pour une demande refusée, souvent jamais. Le sens
// inverse (la capitaine prévenue d'une candidature) existe déjà
// (utils/joinRequestNotify.ts).
//
// UN ÉVÉNEMENT, DEUX CANAUX. `team.join.decided` part dans l'outbox bot :
//   - le dispatcher Web Push en fait une notification à la seule candidate
//     (audience réduite à `userId`, staff exclu — cf. web-push-dispatch) ;
//   - le bot peut en faire un DM (`discordUserId`).
//
// PRÉFÉRENCES. L'événement figure au catalogue des préférences joueuse
// (PLAYER_PUSH_EVENT_TYPES), modèle OPT-OUT. C'est le seul interrupteur qui
// existe pour cette information : une joueuse qui l'a coupé ne veut pas en
// être prévenue, quel que soit le canal. On ne l'émet donc PAS du tout dans ce
// cas — ni push, ni DM. (Le dispatcher refiltre de toute façon le push.)
//
// NE LÈVE JAMAIS : la décision est déjà écrite quand on arrive ici, une
// annonce ratée ne doit pas transformer un succès en erreur 500.

import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinksForUsers } from '@/utils/discordLinks';
import { logger } from '@/utils/logger';
import { loadOptedOutUserIds } from '@/utils/notificationAudience';
import { absoluteSiteUrl } from '@/utils/siteUrl';

export const JOIN_DECIDED_EVENT = 'team.join.decided' as const;

/** Où la candidate retrouve sa demande et son éventuel motif. */
export const JOIN_DECIDED_PLAYER_PATH = '/player';

export type JoinDecisionAnnouncement = {
  tenantId: string;
  /** Compte de la candidate ; `null` (compte supprimé) = rien à annoncer. */
  userId: string | null;
  demandeId: string;
  /** `join` = adhésion, `transfer` = transfert depuis une autre équipe. */
  kind: 'join' | 'transfer';
  decision: 'approved' | 'rejected';
  teamId: string;
  teamName: string;
  /** Rôle accordé (acceptation seulement). */
  role?: string | null;
  /** Motif saisi par la capitaine (refus seulement), jamais un identifiant. */
  reason?: string | null;
};

/**
 * Émet `team.join.decided` pour la candidate. Renvoie `true` si l'événement a
 * été émis — utile au test, jamais à la réponse HTTP.
 */
export async function announceJoinDecision(
  input: JoinDecisionAnnouncement
): Promise<boolean> {
  const { userId } = input;
  if (!userId) return false;
  try {
    const optedOut = await loadOptedOutUserIds([userId], JOIN_DECIDED_EVENT);
    if (optedOut.has(userId)) return false;

    const link = (await getDiscordLinksForUsers([userId])).get(userId) ?? null;
    await emitBotEvent(
      JOIN_DECIDED_EVENT,
      {
        userId,
        discordUserId: link?.discordUserId ?? null,
        discordUsername: link?.discordUsername ?? null,
        demandeId: input.demandeId,
        kind: input.kind,
        decision: input.decision,
        teamId: input.teamId,
        teamName: input.teamName,
        role: input.decision === 'approved' ? (input.role ?? null) : null,
        reason:
          input.decision === 'rejected' && input.reason ? input.reason : null,
        // Absolue : ce lien part aussi dans un DM, où un chemin relatif est
        // inerte. Le push, lui, route via playerUrlForEvent.
        ctaUrl: absoluteSiteUrl(JOIN_DECIDED_PLAYER_PATH),
      },
      input.tenantId
    );
    return true;
  } catch (err) {
    logger.error(
      '[joinDecisionNotify] annonce non émise (%s): %s',
      input.decision,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
