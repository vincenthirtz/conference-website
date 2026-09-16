// utils/joinRequestNotify.ts
//
// Notification best-effort adressée À LA CAPITAINE quand une joueuse candidate
// pour rejoindre son équipe (pages/api/demandes/join.ts).
//
// POURQUOI. La candidature était insérée puis la route répondait « le capitaine
// la validera » — sans prévenir personne. La joueuse interprétait le silence
// comme un refus ; la capitaine découvrait la demande des jours plus tard, en
// passant par hasard sur la gestion d'équipe. Une demande de scrim, elle, part
// déjà en salon + email + DM (utils/scrimRequestNotify.ts), que ce module calque.
//
// UN SEUL CANAL : L'EMAIL. Le DM Discord du scrim passe par l'événement bot
// `scrim.request`, que le bot (repo docker-box) sait traiter. Il n'existe aucun
// événement « candidature » dans le contrat (utils/botEventNames.ts), et en
// déclarer un sans gestionnaire côté bot produirait des événements que personne
// n'écoute. Le DM viendra avec son gestionnaire, pas avant.
//
// Destinataire : la capitaine (`teams.captain_id`), résolue par le même helper
// que le scrim — l'email d'une manager ou d'une coach n'est pas lu ici, pour
// rester aligné sur ce que fait déjà l'espace capitaine.
//
// Ne throw jamais : un échec (pas de capitaine, compte sans email, Brevo en
// panne) est avalé + loggé. L'appelant fait `void notify(...).catch(...)` et la
// candidature réussit quoi qu'il arrive ici.

import { sendJoinRequestEmail } from './email';
import { getTeamCaptainRecipient } from './scrimRequestNotify';
import { logger } from './logger';

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

/**
 * CTA : la gestion d'équipe, où vivent les candidatures reçues (accepter /
 * refuser). Pas /espace-capitaine comme le scrim : cette page ne les liste pas,
 * et un lien qui oblige à chercher la demande reproduit le problème.
 */
export const JOIN_REQUEST_CTA_URL = `${SITE_URL.replace(/\/$/, '')}/player/manage-team`;

export type JoinRequestNotifyOpts = {
  tenantId: string;
  teamId: string;
  playerName?: string | null;
  battleTag?: string | null;
  desiredRole?: string | null;
  message?: string | null;
};

/**
 * Candidature (site) → email à la capitaine de l'équipe visée.
 * Renvoie `true` si un envoi a été tenté avec succès, `false` sinon — utile au
 * test et au log, jamais à la réponse HTTP.
 */
export async function notifyJoinRequest(
  opts: JoinRequestNotifyOpts
): Promise<boolean> {
  try {
    const recipient = await getTeamCaptainRecipient(opts.tenantId, opts.teamId);
    // Équipe sans capitaine (créée par une manager) ou compte sans email : cas
    // légitime, silencieux. La candidature reste visible en gestion d'équipe.
    if (!recipient) return false;

    const result = await sendJoinRequestEmail({
      tenantId: opts.tenantId,
      to: recipient.email,
      recipientTeamName: recipient.teamName,
      playerName: opts.playerName ?? null,
      battleTag: opts.battleTag ?? null,
      desiredRole: opts.desiredRole ?? null,
      message: opts.message ?? null,
      ctaUrl: JOIN_REQUEST_CTA_URL,
    });
    return Boolean(result?.success);
  } catch (e) {
    logger.error('[joinRequestNotify] notifyJoinRequest error:', e);
    return false;
  }
}
