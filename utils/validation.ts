import { z } from 'zod';
import { checkEmailQuality, EMAIL_QUALITY_MESSAGES } from './emailQuality';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_MESSAGE_MIN_LENGTH,
} from './contactLimits';

// ── Shared helpers ──────────────────────────────────────────────────────
//
// Messages d'erreur : zod 4 les prend via `{ error: '…' }` sur chaque
// contrainte. `.describe()` n'est PAS un message d'erreur (simple métadonnée) :
// avec lui, formatZodError renvoyait le texte technique anglais de zod
// (« Too small: expected string to have >=10 characters »), affiché tel quel
// par les formulaires publics.

// Chaîne non vide après trim. Le même message couvre le champ absent ou non
// textuel (`z.string({ error })`) et le champ vide (`.min(1, { error })`).
const trimmedString = (message: string) =>
  z
    .string({ error: message })
    .transform((s) => s.trim())
    .pipe(z.string().min(1, { error: message }));

// Format + qualité (syntaxe stricte, domaines jetables/placeholder bloqués —
// cf. utils/emailQuality). Pas de vérification DNS ici : ce schéma est aussi
// importé côté client.
const emailField = (message: string = EMAIL_QUALITY_MESSAGES.syntax) =>
  z
    .string({ error: message })
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email({ error: message }))
    .superRefine((value, ctx) => {
      const quality = checkEmailQuality(value);
      if (!quality.ok) {
        ctx.addIssue({
          code: 'custom',
          message: EMAIL_QUALITY_MESSAGES[quality.reason],
        });
      }
    });

// ── Contact form ────────────────────────────────────────────────────────

const CONTACT_MESSAGE_REQUIRED = 'Le message est obligatoire.';

export const contactSchema = z.object({
  name: trimmedString('Le nom est obligatoire.'),
  email: emailField('Email invalide.'),
  subject: trimmedString('Le sujet est obligatoire.'),
  message: z
    .string({ error: CONTACT_MESSAGE_REQUIRED })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, { error: CONTACT_MESSAGE_REQUIRED })
        .min(CONTACT_MESSAGE_MIN_LENGTH, {
          error: `Le message doit faire au moins ${CONTACT_MESSAGE_MIN_LENGTH} caractères.`,
        })
        .max(CONTACT_MESSAGE_MAX_LENGTH, {
          error: `Le message ne doit pas dépasser ${CONTACT_MESSAGE_MAX_LENGTH} caractères.`,
        })
    ),
});

export type ContactInput = z.input<typeof contactSchema>;

// ── Partnership request ─────────────────────────────────────────────────

export const partnershipRequestSchema = z.object({
  companyName: trimmedString("Le nom de l'entreprise est requis."),
  contactName: trimmedString('Le nom du contact est requis.'),
  email: emailField("L'email est invalide."),
  phone: z.string().optional(),
  website: z.string().optional(),
  category: z.enum(['super', 'major', 'cultural', 'other'], {
    message: 'Catégorie invalide.',
  }),
  message: trimmedString('Le message est requis.'),
  budgetRange: z.string().optional(),
});

export type PartnershipRequestInput = z.input<typeof partnershipRequestSchema>;

// ── Captain request ─────────────────────────────────────────────────────

const teamMemberSchema = z.object({
  email: emailField(),
  battleTag: z.string().optional(),
  displayName: z.string().optional(),
  specialty: z.enum(['tank', 'dps', 'support', 'flex']).nullable().optional(),
});

export const captainRequestSchema = z
  .object({
    existingTeamId: z.string().trim().min(1).optional(),
    teamName: z.string().trim().min(1).optional(),
    members: z.array(teamMemberSchema).max(5).default([]),
    message: z.string().optional(),
  })
  .refine((d) => d.existingTeamId || d.teamName, {
    message:
      'Sélectionne une équipe existante ou entre un nom pour une nouvelle équipe.',
  });

export type CaptainRequestInput = z.input<typeof captainRequestSchema>;

// ── Helper: format first Zod error as a user-facing string ──────────────

export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  // Message métier posé via `{ error }` sur la contrainte ; à défaut, zod
  // fournit son texte technique (anglais) — d'où l'intérêt de toujours en
  // poser un sur les schémas exposés aux formulaires publics.
  if (first.message && first.message !== 'Required') {
    return first.message;
  }
  const field = first.path.join('.');
  return `Champ invalide : ${field}`;
}
