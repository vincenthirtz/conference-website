// Contrat de /api/bot/v1/register-user — schéma(s) déplacé(s) depuis le handler.
// Source unique handler ↔ spec OpenAPI (`x-zod: bot.register-user`, cf. lib/apiContracts/index.ts).
// Module sans effet de bord : zod et utilitaires purs seulement.

import { z } from 'zod';
import { discordIdSchema } from '../../../utils/botValidation';

export const VALID_ROLES = ['player', 'caster', 'manager', 'admin'] as const;

// Wire layer is camelCase. On préserve la sémantique historique exactement :
//   - email : trim + lowercase, regex EMAIL_RE (`[^\s@]+@[^\s@]+\.[^\s@]+`).
//   - discordUserId : snowflake 15-25 chiffres (discordIdSchema).
//   - discordUsername / displayName : optionnels, trim + slice(0,100).
//   - role : optionnel, défaut 'player'. 'owner' explicitement interdit via
//     l'enum VALID_ROLES (qui ne le contient pas) → 400 INVALID_BODY.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const registerUserBodySchema = z.object({
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
