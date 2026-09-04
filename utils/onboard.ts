// utils/onboard.ts
//
// Shared helpers for the self-service tenant onboarding flow.
// Validation regexes, blacklisted slugs, Discord bot OAuth invite URL builder.
//
// The matching endpoints live under `pages/api/onboard/*` and the auto-claim
// path under `pages/api/bot/v1/tenants/link-guild.ts`.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slug rules
// ---------------------------------------------------------------------------

// Définies dans `./onboardSlug` (module sans dépendance) pour que les pages
// `/onboard/*` puissent les importer sans embarquer zod. Ré-exportées ici pour
// les consommateurs serveur.
export {
  ONBOARD_SLUG_RE,
  RESERVED_SLUGS,
  isReservedSlug,
} from './onboardSlug';
import { ONBOARD_SLUG_RE, isReservedSlug } from './onboardSlug';

// ---------------------------------------------------------------------------
// Zod schema for the POST /api/onboard/tenant-request body
// ---------------------------------------------------------------------------

/**
 * Trim + lowercase. We don't use the shared helper from utils/validation
 * because the slug pipeline needs a specific shape — keep the schema
 * self-contained.
 */
const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min).max(max));

/**
 * Shared tenant-identity sub-schema. Slug/name/email/description rules are
 * identical between the web flow (`POST /api/onboard/tenant-request`, which
 * needs a Turnstile token on top) and the Discord-native flow
 * (`POST /api/bot/v1/tenants/request-onboard`, which proves identity via the
 * bot's API key + the requester's Discord ID). Keep the rules in one place
 * so the slug regex / reserved list / email lowercasing don't drift between
 * the two surfaces.
 */
export const tenantIdentityFields = {
  requested_slug: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(
      z
        .string()
        .regex(
          ONBOARD_SLUG_RE,
          'Slug invalide (3-30 chars, débute par une lettre, puis [a-z0-9-]).'
        )
        .refine(
          (s) => !isReservedSlug(s),
          'Ce slug est réservé, choisissez-en un autre.'
        )
    ),
  requested_name: trimmed(1, 200),
  requested_email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email('Email invalide.')),
  description: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(1000))
    .optional()
    .or(z.literal('')),
} as const;

export const onboardTenantRequestSchema = z.object({
  ...tenantIdentityFields,
  turnstile_token: z.string().min(1, 'Captcha manquant.'),

  // Acceptation des CGV à l'OUVERTURE de l'espace — distincte de celle qui
  // précède chaque commande payante. Ouvrir un espace, même sur l'essai
  // gratuit, c'est entrer dans la relation que ces conditions régissent ;
  // attendre le premier paiement laisserait trente jours de service rendu sans
  // qu'aucun texte n'ait été accepté.
  //
  // `literal(true)` : un `false` n'est pas une valeur à traiter plus loin,
  // c'est une demande qui ne doit pas exister.
  cgv_version: z.string().min(1, 'Version des CGV manquante.'),
  cgv_accepted: z.literal(true, {
    message: 'Vous devez accepter les conditions générales de vente.',
  }),
});

export type OnboardTenantRequestInput = z.input<
  typeof onboardTenantRequestSchema
>;
export type OnboardTenantRequestOutput = z.output<
  typeof onboardTenantRequestSchema
>;

// ---------------------------------------------------------------------------
// SITE_URL helper (same precedence as utils/checkin.ts)
// ---------------------------------------------------------------------------

export function getSiteUrl(): string {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://owwomenscup.fr'
  ).replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Discord bot OAuth invite URL
// ---------------------------------------------------------------------------

/**
 * Build the Discord OAuth URL that invites the bot onto a guild.
 *
 * Permissions are configured via `DISCORD_BOT_PERMISSIONS` (bitfield string),
 * with a sane default that mirrors what the bot actually uses today
 * (kick, ban, manage channels, manage roles, manage messages, view audit log,
 * read history, send messages, embed links, create threads, manage threads,
 * mention everyone, use external emojis, view channel, etc).
 *
 * If `DISCORD_CLIENT_ID` is unset we return `null` so the caller can decide
 * whether to render the page in a degraded state or 500.
 */
export function buildBotInviteUrl(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;

  // 0x10000000 (manage events) | manage channels (0x10) | manage roles (0x10000000)
  // We default to a wide-but-not-administrator bitfield that lines up with
  // the bot's current command set. Operators can override via env.
  const permissions =
    process.env.DISCORD_BOT_PERMISSIONS ?? '1099780063312';

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions,
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
