// features/admin/moderation/supportNotify.ts — prévenir l'auteur·ice d'un
// signalement de la suite qui lui a été donnée.
//
// Déclenché UNIQUEMENT quand le staff coche « Notifier la personne » en
// résolvant ou fermant un ticket : la note de résolution reste d'abord un outil
// interne, la partager est un choix explicite.
//
// Canaux :
//  - email (si le ticket n'est pas anonyme et porte une adresse) — via
//    `sendSupportResolutionEmail`, compte d'envoi du tenant ;
//  - Discord : AUCUN événement bot n'existe pour un MP « suite à ton
//    signalement » (`captain.support.opened` ne sert qu'à l'ouverture). Le
//    résultat le dit (`discord: 'unavailable'`) plutôt que d'émettre un
//    événement que le bot ignorerait. À ajouter côté owwc-discord-bot.
//
// Ne lève jamais : un envoi raté ne doit pas annuler la résolution déjà
// écrite ; le résultat est rendu à l'écran et versé au journal staff.

import type { Logger } from '@/utils/logger';
import { sendSupportResolutionEmail } from '@/utils/email';

export type ReporterNotification = {
  email: 'sent' | 'failed' | 'no_address';
  discord: 'unavailable' | 'no_account';
};

export type NotifiableTicket = {
  id: string;
  is_anonymous: boolean | null;
  reporter_email: string | null;
  discord_user_id: string | null;
  subject: string | null;
  resolution_note: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function notifyTicketReporter(
  ticket: NotifiableTicket,
  status: 'resolved' | 'closed',
  opts: { tenantId: string; logger: Logger }
): Promise<ReporterNotification> {
  // Anonyme : on ne recontacte pas, même si une adresse traîne en base.
  const email =
    !ticket.is_anonymous && ticket.reporter_email?.trim()
      ? ticket.reporter_email.trim()
      : null;

  let emailResult: ReporterNotification['email'] = 'no_address';
  if (email && EMAIL_RE.test(email)) {
    try {
      const res = await sendSupportResolutionEmail({
        to: email,
        ticketId: ticket.id,
        status,
        subject: ticket.subject,
        note: ticket.resolution_note,
        tenantId: opts.tenantId,
      });
      emailResult = res.success ? 'sent' : 'failed';
      if (!res.success) {
        opts.logger.warn('[admin/support] resolution email not sent', {
          ticketId: ticket.id,
          error: res.error,
        });
      }
    } catch (err) {
      emailResult = 'failed';
      opts.logger.error('[admin/support] resolution email error', err);
    }
  }

  return {
    email: emailResult,
    discord:
      !ticket.is_anonymous && ticket.discord_user_id
        ? 'unavailable'
        : 'no_account',
  };
}
