// POST /api/bot/register-user
//
// Lets the Discord bot register any user on the site with their Discord
// identity already linked. Auth via x-api-key (BOT_API_KEY).
//
// Payload:
//   email           required, valid email
//   discordUserId   required, Discord snowflake (15-25 digits)
//   discordUsername optional, Discord display name (snapshot)
//   displayName     optional, name shown on the site (defaults to discord username)
//   role            optional, defaults to 'player'.
//                   Allowed: player | caster | manager | admin (owner forbidden).
//
// Flow:
//   1. Validate everything; reject role='owner'.
//   2. Check the Discord ID isn't already linked to another account.
//   3. Create the Supabase auth user (email_confirm: true) with a random
//      password; welcome email is sent with the credentials.
//   4. For staff roles (caster/manager/admin), also insert into the staff table.
//   5. Insert into user_discord_links.
//   6. On any post-creation failure, roll back (delete the auth user) so a
//      retry can succeed.
//
// Returns 201 with { authUserId, role, discordUserId } on success.
// 409 if the email is already in use or the Discord ID already linked.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sendWelcomeEmail } from '@/utils/email';
import { upsertDiscordLink } from '@/utils/discordLinks';
import { logger } from '../../../utils/logger';

const VALID_ROLES = ['player', 'caster', 'manager', 'admin'] as const;
const STAFF_ROLES = new Set(['caster', 'manager', 'admin']);
const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Role = (typeof VALID_ROLES)[number];

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

function generatePassword(length = 16): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*';
  const maxValid = 256 - (256 % alphabet.length);
  const result: string[] = [];
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length);
    for (const byte of bytes) {
      if (byte < maxValid && result.length < length) {
        result.push(alphabet[byte % alphabet.length]);
      }
    }
  }
  return result.join('');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'bot-register'))
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/register-user] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const email = rawEmail.toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const discordUserId =
    typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  if (!DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'discordUserId invalide' });
  }

  const discordUsername =
    typeof body.discordUsername === 'string'
      ? body.discordUsername.trim().slice(0, 100) || null
      : null;

  const displayName =
    typeof body.displayName === 'string'
      ? body.displayName.trim().slice(0, 100)
      : '';

  const rawRole =
    typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'player';
  if (rawRole === 'owner') {
    return res
      .status(400)
      .json({ error: "Le rôle 'owner' ne peut pas être attribué via le bot." });
  }
  if (!(VALID_ROLES as readonly string[]).includes(rawRole)) {
    return res.status(400).json({
      error: `Rôle invalide. Valeurs : ${VALID_ROLES.join(', ')}.`,
    });
  }
  const role = rawRole as Role;

  // Refuse if this Discord account is already linked elsewhere.
  const { data: existingLink, error: linkLookupErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (linkLookupErr) {
    logger.error('[bot/register-user] link lookup error', linkLookupErr);
    return res.status(500).json({ error: 'Erreur de vérification' });
  }
  if (existingLink) {
    return res.status(409).json({
      error: 'Ce compte Discord est déjà lié à un utilisateur du site.',
      existingAuthUserId: existingLink.auth_user_id,
    });
  }

  const finalDisplayName = displayName || discordUsername || email.split('@')[0];
  const password = generatePassword(16);

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        display_name: finalDisplayName,
      },
    });

  if (createErr || !created?.user?.id) {
    const msg = createErr?.message ?? '';
    // Supabase surfaces email duplicates with this message; fall back on the
    // generic 500 if the SDK changes wording.
    if (/already (registered|been registered|exists)/i.test(msg)) {
      return res.status(409).json({
        error: 'Email déjà utilisé. Le compte existe peut-être déjà.',
      });
    }
    logger.error('[bot/register-user] createUser error', createErr);
    return res.status(500).json({ error: "Échec de création de l'utilisateur" });
  }

  const authUserId = created.user.id;

  // Staff roles also need a row in the staff table.
  if (STAFF_ROLES.has(role)) {
    const { error: staffErr } = await supabaseAdmin.from('staff').insert({
      auth_user_id: authUserId,
      role,
      display_name: finalDisplayName,
      email,
    });
    if (staffErr) {
      logger.error('[bot/register-user] staff insert error', staffErr);
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return res.status(500).json({ error: 'Échec création staff' });
    }
  }

  const linkRes = await upsertDiscordLink(
    authUserId,
    discordUserId,
    discordUsername
  );
  if (!linkRes.ok) {
    logger.error('[bot/register-user] link insert failed', linkRes.error);
    if (STAFF_ROLES.has(role)) {
      await supabaseAdmin
        .from('staff')
        .delete()
        .eq('auth_user_id', authUserId);
    }
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return res
      .status(500)
      .json({ error: 'Échec création lien Discord (rollback effectué)' });
  }

  // Fire-and-forget welcome email with the generated password.
  sendWelcomeEmail(email, password).catch((e) =>
    logger.error('[bot/register-user] welcome email error', e)
  );

  return res.status(201).json({
    success: true,
    authUserId,
    role,
    discordUserId,
    email,
    displayName: finalDisplayName,
  });
}
