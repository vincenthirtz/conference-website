// features/player/onboarding/schemas.ts — création d'équipe ANONYME
// (POST /api/teams/create-with-member, wizard /team/create) — lot P11.
//
// Zod seul : importable par la page publique /team/create (garde de bundle
// tests/unit/adminBoundariesGuard.test.ts : seuls les `schemas.ts` joueuse
// sont atteignables depuis le site public).
//
// Schéma de STRUCTURE, volontairement permissif : il type le corps (un corps
// mal formé répond 400 au lieu de faire planter la route en 500) mais ne
// porte AUCUNE règle métier. Les règles — nom requis, longueurs, URLs,
// plafonds de roster, BattleTag, manager — restent au service, qui répond
// avec les CODES historiques (`NAME_REQUIRED`, `TOO_MANY_MEMBERS`…) que le
// wizard traduit (code → i18n). Un corps que l'ancienne route acceptait est
// accepté à l'identique.

import * as z from 'zod';

const INVALID = 'Requête invalide.';

/** Chaîne facultative (la route faisait `.trim()` dessus). */
const text = z.string({ error: INVALID }).nullish();

/**
 * Valeur facultative convertie en texte (la route faisait `.toString()` :
 * un nombre était accepté).
 */
const loose = z
  .union([z.string(), z.number(), z.boolean()], { error: INVALID })
  .nullish()
  .transform((v) => (v === null || v === undefined ? v : String(v)));

/** Ligne du roster déclaré. */
export const CreateTeamMemberInput = z.object({
  email: loose,
  user_id: loose,
  role: loose,
  set_captain: z.unknown().optional(),
  battle_tag: loose,
  specialty: loose,
});
export type CreateTeamMemberInputT = z.infer<typeof CreateTeamMemberInput>;

/** Corps de POST /api/teams/create-with-member. */
export const CreateTeamBody = z.object({
  name: text,
  short_name: loose,
  logo_url: text,
  country: loose,
  description: loose,
  discord: text,
  website: text,
  /** Chemin « membre unique » historique (le wizard envoie `members`). */
  member_email: text,
  member_role: text,
  member_user_id: text,
  member_battle_tag: text,
  member_specialty: text,
  set_captain: z.unknown().optional(),
  /** Hors tableau : ignoré, comme avant (`Array.isArray`). */
  members: z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(CreateTeamMemberInput)),
  /**
   * Création « en tant que manager » : la personne crée l'équipe sans y
   * jouer ; tout le roster (capitaine désignée comprise) est INVITÉ.
   */
  manager_email: text,
  tournament_id: loose,
  /** Réponses aux champs d'inscription du tournoi, validées par le service. */
  field_values: z.unknown().optional(),
  // Anti-abus : lus par la garde AVANT ce schéma (definePublicRoute).
  honeypot: z.unknown().optional(),
  captchaToken: z.unknown().optional(),
  captchaAnswer: z.unknown().optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamBody>;

/** Membre inséré directement (la créatrice, ou le manager). */
export type CreatedMember = {
  id: string | null;
  user_id: string;
  role: string;
  captain: boolean;
  battle_tag: string | null;
  specialty: string | null;
};

/** Membre INVITÉ (consentement requis) — ou écarté, avec sa raison. */
export type InvitedMember = {
  invitation_id: string | null;
  user_id: string;
  role: string;
  battle_tag: string | null;
  specialty: string | null;
  skipped_reason?: string;
};

/** Réponse 201 de la création. */
export type CreateTeamResponse = {
  team: Record<string, unknown>;
  members?: CreatedMember[];
  invitedMembers?: InvitedMember[];
  tournament?: { tournament_name: string; stages_count: number };
  tournament_application?: {
    tournament_name: string;
    demande_id: string | null;
  };
  info?: string;
  /** Pont magic-link : e-mail d'accès envoyé à la créatrice (masqué). */
  accessEmail?: { sent: boolean; to?: string };
};
