// features/player/demandes/schemas.ts — demandes de la joueuse (rejoindre,
// transfert, inscription d'équipe, annulation) — lot P4.
//
// Zod seul. Importé par les routes `pages/api/demandes/*` en chemin RELATIF
// tant qu'elles ne sont pas migrées (`@/features/player/` marque une route
// migrée pour playerBoundariesGuard règle 6, la matrice de permissions et les
// contrats), par le registre OpenAPI (lib/apiContracts) et, demain, le client.
//
// Les messages sont ceux que les routes renvoyaient, dans l'ordre où elles
// testaient les champs : `parseBody` renvoie le message de la première issue.
// Les dérivations (trim → null, rôle par défaut…) restent dans la route.

import { z } from 'zod';
import { looseUuid } from '../_shared/zod';

const TEXT_INVALID = 'Texte invalide.';

/** Message libre facultatif, plafonné APRÈS trim. */
const optionalMessage = (tooLong: string) =>
  z.string({ error: TEXT_INVALID }).trim().max(1000, tooLong).nullish();

/** Rôle souhaité : toute valeur inconnue retombe sur `player` (route). */
const desiredRole = z.string({ error: 'Rôle invalide.' }).nullish();

const JOIN_TEAM = 'Selectionne une equipe a rejoindre.';

/** Corps de POST /api/demandes/join. */
export const JoinDemandeBody = z.object({
  teamId: z.string({ error: JOIN_TEAM }).trim().min(1, JOIN_TEAM),
  message: optionalMessage('Message trop long (max 1000 caractères).'),
  desiredRole,
  /**
   * BattleTag saisi dans le formulaire. Facultatif : le profil peut déjà le
   * porter. Une valeur non textuelle est IGNORÉE (repli sur le profil), comme
   * avant — d'où `.catch`.
   */
  battleTag: z.string().nullish().catch(null),
});
export type JoinDemandeInput = z.infer<typeof JoinDemandeBody>;

const TRANSFER_TEAM = 'Selectionne une equipe cible.';

/** Corps de POST /api/demandes/transfer. */
export const TransferDemandeBody = z.object({
  teamId: z.string({ error: TRANSFER_TEAM }).trim().min(1, TRANSFER_TEAM),
  message: optionalMessage('Message trop long (max 1000 caracteres).'),
  desiredRole,
  /** Capitaine / manager : propose le transfert d'une de ses joueuses. */
  targetPlayerId: z.string({ error: 'Joueuse cible invalide.' }).nullish(),
});
export type TransferDemandeInput = z.infer<typeof TransferDemandeBody>;

const REGISTER_IDS = 'teamId et tournamentId sont requis.';

/** Corps de POST /api/demandes/register-team. */
export const RegisterTeamDemandeBody = z.object({
  teamId: z.string({ error: REGISTER_IDS }).trim().min(1, REGISTER_IDS),
  tournamentId: z.string({ error: REGISTER_IDS }).trim().min(1, REGISTER_IDS),
  message: optionalMessage('Message trop long (max 1000 caractères).'),
  /**
   * Réponses aux champs d'inscription personnalisés du tournoi (Flow B).
   * Validées contre les définitions DU TOURNOI par la route
   * (`validateRegistrationAnswers`) : leur forme dépend de lui.
   */
  field_values: z.unknown().optional(),
});
export type RegisterTeamDemandeInput = z.infer<typeof RegisterTeamDemandeBody>;

/** Corps de DELETE /api/demandes/cancel. */
export const CancelDemandeBody = z.object({
  demandeId: looseUuid('demandeId (UUID) requis.'),
});
export type CancelDemandeInput = z.infer<typeof CancelDemandeBody>;

/**
 * Corps de POST /api/demandes/scrim (lot P11 : quitte la route). Validé par
 * le service, pas par le noyau : l'erreur historique porte `field`.
 */
const SCRIM_TEAM = 'Selectionne une equipe adverse.';

export const ScrimDemandeBody = z.object({
  // `{ error }` sur le type aussi : un teamId ABSENT renvoyait le message brut
  // de zod, en anglais (« Invalid input: expected string… »).
  teamId: z.string({ error: SCRIM_TEAM }).trim().min(1, SCRIM_TEAM),
  message: z.string().trim().max(1000).optional().nullable(),
  /** Négociation multi-créneaux : 1..5 dates ISO sur la table. */
  proposedSlots: z.array(z.string()).optional(),
  /** Ancien créneau unique (replié dans `proposedSlots`). */
  preferredDate: z.string().optional(),
});
export type ScrimDemandeInput = z.infer<typeof ScrimDemandeBody>;

/**
 * Corps de POST /api/demandes/caster-application (lot P11 : quitte la
 * route). Validé par le service : l'erreur historique est `Invalid body.` +
 * `fieldErrors` (forme `flatten()`), pas le `fields` du noyau.
 */
export const CasterApplicationBody = z.object({
  motivation: z
    .string()
    .trim()
    .max(1000, 'Motivation trop longue (max 1000 caractères).')
    .optional(),
  portfolioUrl: z
    .string()
    .trim()
    .max(300, 'URL trop longue (max 300 caractères).')
    .url('URL de portfolio invalide.')
    .optional(),
});
export type CasterApplicationInput = z.infer<typeof CasterApplicationBody>;
