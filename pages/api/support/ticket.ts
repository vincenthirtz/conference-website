// pages/api/support/ticket.ts
// Public endpoint: anyone (anonymously or not) can submit a support ticket
// (litige, comportement, technique, autre) for a tournament. Severity HIGH
// triggers a moderation ping in Discord.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { notifySupportTicket } from '@/utils/discord';
import { logger } from '../../../utils/logger';
import {
  sendSupportConfirmationEmail,
  sendSupportStaffNotificationEmail,
} from '@/utils/email';

const VALID_CATEGORIES = ['dispute', 'behavior', 'technical', 'other'] as const;
const VALID_SEVERITIES = ['low', 'medium', 'high'] as const;

type Category = (typeof VALID_CATEGORIES)[number];
type Severity = (typeof VALID_SEVERITIES)[number];

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 5 submissions per hour per IP
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60 * 60_000 },
      'support-ticket'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const body = req.body || {};
  const {
    tournamentId,
    category,
    severity,
    subject,
    message,
    isAnonymous,
    name,
    email,
  } = body;

  // Validation
  if (
    typeof category !== 'string' ||
    !(VALID_CATEGORIES as readonly string[]).includes(category)
  ) {
    return res.status(400).json({
      error: `Catégorie invalide. Valeurs : ${VALID_CATEGORIES.join(', ')}`,
    });
  }
  if (
    typeof severity !== 'string' ||
    !(VALID_SEVERITIES as readonly string[]).includes(severity)
  ) {
    return res.status(400).json({
      error: `Sévérité invalide. Valeurs : ${VALID_SEVERITIES.join(', ')}`,
    });
  }
  if (typeof message !== 'string' || message.trim().length < 10) {
    return res.status(400).json({
      error: 'Message requis (min 10 caractères)',
    });
  }
  if (message.length > 5000) {
    return res
      .status(400)
      .json({ error: 'Message trop long (max 5000 caractères)' });
  }
  if (
    subject !== undefined &&
    subject !== null &&
    typeof subject !== 'string'
  ) {
    return res.status(400).json({ error: 'Sujet invalide' });
  }
  if (subject && subject.length > 200) {
    return res
      .status(400)
      .json({ error: 'Sujet trop long (max 200 caractères)' });
  }

  let validTournamentId: string | null = null;
  if (tournamentId) {
    if (typeof tournamentId !== 'string' || !isValidUUID(tournamentId)) {
      return res.status(400).json({ error: 'tournamentId invalide' });
    }
    validTournamentId = tournamentId;
  }

  const anon = isAnonymous === true;
  const cleanName =
    !anon && typeof name === 'string'
      ? name.trim().slice(0, 100) || null
      : null;
  const cleanEmail =
    !anon && typeof email === 'string' && isValidEmail(email.trim())
      ? email.trim().toLowerCase()
      : null;

  // If non-anonymous, we strongly encourage an email so we can follow up
  if (!anon && !cleanEmail) {
    return res.status(400).json({
      error:
        'Email requis pour les signalements non anonymes (ou cochez "rester anonyme")',
    });
  }

  // Create the ticket
  const { data: ticket, error: insertErr } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      tournament_id: validTournamentId,
      reporter_name: cleanName,
      reporter_email: cleanEmail,
      is_anonymous: anon,
      category: category as Category,
      severity: severity as Severity,
      subject: subject ? subject.trim() : null,
      message: message.trim(),
      status: 'open',
    })
    .select('*')
    .single();

  if (insertErr || !ticket) {
    logger.error('[support/ticket] insert error:', insertErr);
    return res.status(500).json({ error: 'Échec de la création du ticket' });
  }

  // Fire-and-forget: Discord notification + email confirmation
  void notifySupportTicket({
    ticketId: ticket.id,
    tournamentId: validTournamentId,
    category: ticket.category,
    severity: ticket.severity,
    isAnonymous: anon,
    reporterName: cleanName,
    reporterEmail: cleanEmail,
    subject: ticket.subject,
    message: ticket.message,
    adminUrl: `${SITE_URL.replace(/\/$/, '')}/admin/support`,
  })
    .then((r) => {
      if (r.messageId) {
        // Store the Discord message ID for future edits
        return supabaseAdmin!
          .from('support_tickets')
          .update({ discord_message_id: r.messageId })
          .eq('id', ticket.id);
      }
    })
    .catch((e) => logger.error('[support] notifySupportTicket error:', e));

  if (!anon && cleanEmail) {
    void sendSupportConfirmationEmail({
      to: cleanEmail,
      ticketId: ticket.id,
      category: ticket.category,
      severity: ticket.severity,
      subject: ticket.subject,
    }).catch((e) => logger.error('[support] confirm email error:', e));
  }

  // Email staff for tickets that bypass the reporter-confirmation flow:
  // anonymous tickets (Discord-only otherwise) and HIGH-severity tickets.
  if (anon || ticket.severity === 'high') {
    void sendSupportStaffNotificationEmail({
      ticketId: ticket.id,
      category: ticket.category,
      severity: ticket.severity,
      isAnonymous: anon,
      reporterName: cleanName,
      reporterEmail: cleanEmail,
      subject: ticket.subject,
      message: ticket.message,
      adminUrl: `${SITE_URL.replace(/\/$/, '')}/admin/support`,
    }).catch((e) => logger.error('[support] staff email error:', e));
  }

  return res.status(201).json({
    success: true,
    ticketId: ticket.id,
    referenceShort: ticket.id.slice(0, 8),
  });
}
