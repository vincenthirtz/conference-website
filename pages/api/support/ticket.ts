// pages/api/support/ticket.ts
// Public endpoint: anyone (anonymously or not) can submit a support ticket
// (litige, comportement, technique, autre) for a tournament. Severity HIGH
// triggers a moderation ping in Discord.
//
// Also accepts authenticated calls from the Discord bot via the
// `x-api-key` header (validated against BOT_API_KEY). In bot mode,
// the IP rate-limit is replaced by a per-Discord-user rate-limit and the
// Discord identity is stored alongside the ticket (unless isAnonymous=true).

import crypto from 'crypto';
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

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Per-Discord-user rate limit: 5 tickets / hour. Reuses the same
// in-memory store mechanism as `applyRateLimit` but keyed on the Discord
// user ID rather than the bot's IP (which would be a single shared host).
const botUserRateStore = new Map<string, number[]>();

function applyBotUserRateLimit(
  discordUserId: string,
  res: NextApiResponse
): boolean {
  const max = 5;
  const windowMs = 60 * 60_000;
  const now = Date.now();
  const timestamps = (botUserRateStore.get(discordUserId) ?? []).filter(
    (t) => now - t < windowMs
  );
  if (timestamps.length >= max) {
    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json({
      error: 'Trop de signalements depuis ce compte Discord. Réessaye plus tard.',
    });
    return true;
  }
  timestamps.push(now);
  botUserRateStore.set(discordUserId, timestamps);
  if (botUserRateStore.size > 10_000) {
    for (const [k, ts] of botUserRateStore) {
      const fresh = ts.filter((t) => now - t < windowMs);
      if (fresh.length === 0) botUserRateStore.delete(k);
      else botUserRateStore.set(k, fresh);
      if (botUserRateStore.size <= 8_000) break;
    }
  }
  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isBotRequest = verifyBotApiKey(req);

  if (!isBotRequest) {
    // Web mode: rate-limit per IP (5/h).
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
    discordUserId: rawDiscordUserId,
    discordUsername: rawDiscordUsername,
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

  // Discord identity validation (only in bot mode; ignored otherwise).
  let cleanDiscordUserId: string | null = null;
  let cleanDiscordUsername: string | null = null;
  if (isBotRequest) {
    if (
      typeof rawDiscordUserId !== 'string' ||
      !DISCORD_ID_RE.test(rawDiscordUserId)
    ) {
      return res.status(400).json({ error: 'discordUserId invalide' });
    }
    cleanDiscordUserId = rawDiscordUserId;
    if (typeof rawDiscordUsername === 'string') {
      cleanDiscordUsername =
        rawDiscordUsername.trim().slice(0, 100) || null;
    }

    // Bot-mode rate-limit is per Discord user, not per IP.
    if (applyBotUserRateLimit(cleanDiscordUserId, res)) return;
  }

  // In bot mode, the Discord identity replaces the email requirement for
  // non-anonymous tickets (we can ping back via DM). Web mode still requires
  // an email when not anonymous.
  if (!anon && !cleanEmail && !cleanDiscordUserId) {
    return res.status(400).json({
      error:
        'Email requis pour les signalements non anonymes (ou cochez "rester anonyme")',
    });
  }

  // Privacy: when the reporter chose anonymous, drop the Discord identity
  // before persisting, even though the bot sent it.
  const storedDiscordUserId = anon ? null : cleanDiscordUserId;
  const storedDiscordUsername = anon ? null : cleanDiscordUsername;

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
      source: isBotRequest ? 'discord_bot' : 'web',
      discord_user_id: storedDiscordUserId,
      discord_username: storedDiscordUsername,
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
