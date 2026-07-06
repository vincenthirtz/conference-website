import { z } from 'zod';
import { checkEmailQuality, EMAIL_QUALITY_MESSAGES } from './emailQuality';

// ── Shared helpers ──────────────────────────────────────────────────────

const trimmedString = (min = 1) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min));

// Format + qualité (syntaxe stricte, domaines jetables/placeholder bloqués —
// cf. utils/emailQuality). Pas de vérification DNS ici : ce schéma est aussi
// importé côté client.
const emailField = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email())
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

export const contactSchema = z.object({
  name: trimmedString().describe('Le nom est obligatoire.'),
  email: emailField.describe('Email invalide.'),
  subject: trimmedString().describe('Le sujet est obligatoire.'),
  message: trimmedString(10)
    .pipe(z.string().max(5000))
    .describe('Le message est obligatoire.'),
});

export type ContactInput = z.input<typeof contactSchema>;

// ── Partnership request ─────────────────────────────────────────────────

export const partnershipRequestSchema = z.object({
  companyName: trimmedString().describe("Le nom de l'entreprise est requis."),
  contactName: trimmedString().describe('Le nom du contact est requis.'),
  email: emailField.describe("L'email est invalide."),
  phone: z.string().optional(),
  website: z.string().optional(),
  category: z.enum(['super', 'major', 'cultural', 'other'], {
    message: 'Catégorie invalide.',
  }),
  message: trimmedString().describe('Le message est requis.'),
  budgetRange: z.string().optional(),
});

export type PartnershipRequestInput = z.input<typeof partnershipRequestSchema>;

// ── Captain request ─────────────────────────────────────────────────────

const teamMemberSchema = z.object({
  email: emailField,
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
  // Use the field-level `describe()` message when available
  if (first.message && first.message !== 'Required') {
    return first.message;
  }
  const field = first.path.join('.');
  return `Champ invalide : ${field}`;
}
