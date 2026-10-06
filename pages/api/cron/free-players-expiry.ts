// pages/api/cron/free-players-expiry.ts
//
// Fin de vie des fiches « joueuse libre » publiées depuis /rejoindre. Deux
// passes, une fois par jour :
//
//   1. RELANCE — une fiche web qui expire dans moins de `REMINDER_DAYS` jours
//      reçoit UN email : « je cherche toujours » (prolonge de 60 jours) ou
//      « retirer ma fiche ». Jusqu'ici l'expiration était silencieuse : la
//      joueuse disparaissait de la liste en se croyant toujours visible.
//      Déduplication par `expiry_reminder_sent_at`, posé AVANT l'envoi par un
//      update conditionnel : deux exécutions concurrentes ne relancent pas deux
//      fois. Le prix est qu'un envoi raté n'est pas retenté — préférable à un
//      doublon dans la boîte de quelqu'un qu'on relance déjà.
//
//   2. ANNONCES DISCORD — une fiche expirée dont l'annonce est encore ancrée
//      voit celle-ci retirée (`free_player.withdrawn`), puis l'ancrage effacé.
//      La fiche elle-même n'est PAS purgée : elle reste prolongeable.
//
// Portée : toutes les fiches web, tous espaces confondus — chaque email part
// au nom de l'espace de la fiche. Les fiches Discord n'ont pas d'échéance :
// elles vivent au rythme du rôle.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query). GET + POST.
// `?dry_run=1` décrit ce qui partirait sans rien envoyer ni écrire.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { sendFreePlayerExpiryReminderEmail } from '@/utils/email';
import {
  buildFreePlayerRemovalUrl,
  buildFreePlayerRenewUrl,
} from '@/utils/freePlayerRemoval';
import {
  ANNOUNCEMENT_SELECT,
  requestAnnouncementWithdrawal,
  type AnnouncedRow,
} from '@/utils/freePlayers/announcement';
import { logger } from '@/utils/logger';

/** La relance part quand il reste moins de 7 jours. */
export const REMINDER_DAYS = 7;
/** Plafond par passage : le reste attend le lendemain, rien ne se perd. */
const BATCH = 100;

type ReminderRow = {
  id: string;
  tenant_id: string;
  display_name: string | null;
  contact_email: string | null;
  expires_at: string;
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/free-players-expiry] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

async function sendReminders(now: Date, dryRun: boolean) {
  const horizon = new Date(now.getTime() + REMINDER_DAYS * 86_400_000);
  const { data, error } = await supabaseAdmin
    .from('free_players')
    .select('id, tenant_id, display_name, contact_email, expires_at')
    .eq('source', 'web')
    .is('expiry_reminder_sent_at', null)
    .not('contact_email', 'is', null)
    .gt('expires_at', now.toISOString())
    .lte('expires_at', horizon.toISOString())
    .order('expires_at', { ascending: true })
    .limit(BATCH);
  if (error) {
    logger.error('[cron/free-players-expiry] reminders lookup error', error);
    return { candidates: 0, sent: 0, error: 'lookup_failed' };
  }
  const rows = (data ?? []) as ReminderRow[];
  if (dryRun) return { candidates: rows.length, sent: 0, dryRun: true };

  let sent = 0;
  for (const row of rows) {
    // Revendication : seul le passage qui pose la date envoie.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('free_players')
      .update({ expiry_reminder_sent_at: now.toISOString() })
      .eq('id', row.id)
      .is('expiry_reminder_sent_at', null)
      .select('id');
    if (claimErr) {
      logger.error('[cron/free-players-expiry] claim error', claimErr);
      continue;
    }
    if (!claimed || claimed.length === 0) continue;

    const result = await sendFreePlayerExpiryReminderEmail({
      tenantId: row.tenant_id,
      to: row.contact_email as string,
      displayName: row.display_name ?? '',
      expiresAt: row.expires_at,
      renewUrl: buildFreePlayerRenewUrl(row.id),
      removeUrl: buildFreePlayerRemovalUrl(row.id),
    }).catch((err) => {
      logger.error('[cron/free-players-expiry] email failed', err);
      return null;
    });
    if (result?.success) sent += 1;
  }
  return { candidates: rows.length, sent };
}

async function withdrawExpiredAnnouncements(now: Date, dryRun: boolean) {
  const { data, error } = await supabaseAdmin
    .from('free_players')
    .select(ANNOUNCEMENT_SELECT)
    .eq('source', 'web')
    .not('discord_announce_message_id', 'is', null)
    .lte('expires_at', now.toISOString())
    .limit(BATCH);
  if (error) {
    logger.error(
      '[cron/free-players-expiry] announcements lookup error',
      error
    );
    return { candidates: 0, withdrawn: 0, error: 'lookup_failed' };
  }
  const rows = (data ?? []) as AnnouncedRow[];
  if (dryRun) return { candidates: rows.length, withdrawn: 0, dryRun: true };

  let withdrawn = 0;
  for (const row of rows) {
    const requested = await requestAnnouncementWithdrawal(row, 'expired');
    if (!requested) continue;
    // Effacé seulement s'il désigne toujours CE message : une réannonce
    // arrivée entre-temps (prolongation) ne doit pas perdre son ancrage.
    const { error: clearErr } = await supabaseAdmin
      .from('free_players')
      .update({
        discord_announce_channel_id: null,
        discord_announce_message_id: null,
      })
      .eq('id', row.id)
      .eq('discord_announce_message_id', row.discord_announce_message_id ?? '');
    if (clearErr) {
      logger.error('[cron/free-players-expiry] clear anchor error', clearErr);
      continue;
    }
    withdrawn += 1;
  }
  return { candidates: rows.length, withdrawn };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
  const now = new Date();

  const reminders = await sendReminders(now, dryRun);
  const announcements = await withdrawExpiredAnnouncements(now, dryRun);

  logger.info(
    '[cron/free-players-expiry] relances=%d/%d annonces retirées=%d/%d',
    reminders.sent,
    reminders.candidates,
    announcements.withdrawn,
    announcements.candidates
  );

  return res.status(200).json({ reminders, announcements });
}
