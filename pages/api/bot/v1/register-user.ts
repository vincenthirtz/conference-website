// POST /api/bot/v1/register-user
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
import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { discordIdSchema } from '@/utils/botValidation';
import { sendWelcomeEmail } from '@/utils/email';
import { upsertDiscordLink } from '@/utils/discordLinks';
import { logger } from '@/utils/logger';

const VALID_ROLES = ['player', 'caster', 'manager', 'admin'] as const;
const STAFF_ROLES = new Set(['caster', 'manager', 'admin']);

type Role = (typeof VALID_ROLES)[number];

// Wire layer is camelCase. On préserve la sémantique historique exactement :
//   - email : trim + lowercase, regex EMAIL_RE (`[^\s@]+@[^\s@]+\.[^\s@]+`).
//   - discordUserId : snowflake 15-25 chiffres (discordIdSchema).
//   - discordUsername / displayName : optionnels, trim + slice(0,100).
//   - role : optionnel, défaut 'player'. 'owner' explicitement interdit via
//     l'enum VALID_ROLES (qui ne le contient pas) → 400 INVALID_BODY.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const registerUserBodySchema = z.object({
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().regex(EMAIL_RE, 'Email invalide')),
  discordUserId: discordIdSchema,
  // discordUsername / displayName : historiquement, un type non-string OU une
  // clé absente est silencieusement ignoré (→ null / ''), jamais rejeté. On
  // garde z.unknown() + transform pour préserver cette tolérance exacte.
  // `.optional()` est requis depuis zod 4.4 : sans lui, une clé absente est
  // rejetée (« expected nonoptional, received undefined ») au lieu de retomber
  // sur la valeur par défaut.
  discordUsername: z
    .unknown()
    .optional()
    .transform((v) => {
      if (typeof v !== 'string') return null;
      const trimmed = v.trim().slice(0, 100);
      return trimmed.length > 0 ? trimmed : null;
    }),
  displayName: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === 'string' ? v.trim().slice(0, 100) : '')),
  // role : historiquement, une string vide / whitespace retombe sur 'player'
  // (`body.role.trim()` falsy). On préserve ça en mappant '' → undefined avant
  // l'enum, plutôt que de rejeter. `owner` n'est pas dans VALID_ROLES → rejet.
  role: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const trimmed = v.trim();
    return trimmed === '' ? undefined : trimmed;
  }, z.enum(VALID_ROLES).optional()),
});

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

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const input = req.botInput as z.infer<typeof registerUserBodySchema>;

  const email = input.email;
  const discordUserId = input.discordUserId;
  const discordUsername = input.discordUsername ?? null;
  const displayName = input.displayName ?? '';
  const role: Role = input.role ?? 'player';

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

  const finalDisplayName =
    displayName || discordUsername || email.split('@')[0];
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
    return res
      .status(500)
      .json({ error: "Échec de création de l'utilisateur" });
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
      await supabaseAdmin.from('staff').delete().eq('auth_user_id', authUserId);
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

  // Trace : no staff actor (the bot registers a fresh user), so structured
  // logger.info is the right audit channel here, not staff_logs.
  logger.info('[bot/register-user] user registered via bot', {
    authUserId,
    role,
    discordUserId,
    isStaff: STAFF_ROLES.has(role),
  });

  return res.status(201).json({
    success: true,
    authUserId,
    role,
    discordUserId,
    email,
    displayName: finalDisplayName,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 20, key: 'bot-register' },
  idempotent: true,
  bodySchema: registerUserBodySchema,
});
