// features/player/team/schemas.ts — gestion d'équipe côté capitaine / manager
// (roster, demandes reçues, droits délégués, fiche publique) — lot P4.
//
// Zod seul. Importé par les routes `pages/api/teams/*` en chemin RELATIF tant
// qu'elles ne sont pas migrées (`@/features/player/` marque une route migrée
// pour playerBoundariesGuard règle 6, la matrice de permissions et les
// contrats), par le registre OpenAPI (lib/apiContracts) et, demain, le client.
//
// Les messages sont ceux que les routes renvoyaient, dans l'ordre où elles
// testaient les champs : `parseBody` renvoie le message de la première issue.

import { z } from 'zod';
import { looseUuid } from '../_shared/zod';
import { REVIEW_SUBJECT_TYPES } from '../../../utils/teams/teamReviews';

const DEMANDE_ACTION = 'Action invalide. Utilise "approve" ou "reject".';

/** Corps de POST /api/teams/transfer-requests. */
export const TransferRequestDecisionBody = z.object({
  demandeId: looseUuid('demandeId invalide.'),
  action: z.enum(['approve', 'reject'], { error: DEMANDE_ACTION }),
});
export type TransferRequestDecisionInput = z.infer<
  typeof TransferRequestDecisionBody
>;

/** Corps de POST /api/teams/join-requests. */
export const JoinRequestDecisionBody = TransferRequestDecisionBody.extend({
  /**
   * BattleTag corrigé par la personne qui approuve. Normalisé et vérifié par
   * `resolveDemandeBattleTag` (utils/teams/demandeBattleTag.ts), qui porte
   * ses propres messages : sa forme n'est pas figée ici.
   */
  battleTag: z.unknown().optional(),
});
export type JoinRequestDecisionInput = z.infer<typeof JoinRequestDecisionBody>;

/* ------------------------------------------------------------------------
 * Roster : membres, rôles, postes, capitanat
 * ---------------------------------------------------------------------- */

/**
 * Corps de POST /api/teams/update-member-role. `role` : chaîne non vide ici ;
 * son appartenance au catalogue (`TEAM_ROLE_VALUES`, utils/teamRoles.ts —
 * hors de portée d'un schéma sans alias) reste vérifiée par la route.
 */
export const UpdateMemberRoleBody = z.object({
  memberId: looseUuid('memberId invalide.'),
  role: z.string({ error: 'role requis.' }).min(1, 'role requis.'),
});
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleBody>;

const SPECIALTY_INVALID =
  'specialty invalide. Attendu : tank | dps | support | flex | null.';

/**
 * Corps de POST /api/teams/update-member-specialty. `null` / absent efface ;
 * la valeur (tank | dps | support | flex, casse et espaces tolérés) est
 * vérifiée par la route.
 */
export const UpdateMemberSpecialtyBody = z.object({
  memberId: looseUuid('memberId invalide.'),
  specialty: z.string({ error: SPECIALTY_INVALID }).nullish(),
});
export type UpdateMemberSpecialtyInput = z.infer<
  typeof UpdateMemberSpecialtyBody
>;

/** Corps de POST /api/teams/transfer-captain. */
export const TransferCaptainBody = z.object({
  newCaptainUserId: looseUuid('newCaptainUserId (UUID) requis.'),
});
export type TransferCaptainInput = z.infer<typeof TransferCaptainBody>;

/** Corps de DELETE /api/teams/{teamId}/members. */
export const RemoveTeamMemberBody = z.object({
  memberId: looseUuid('memberId (UUID) requis.'),
});
export type RemoveTeamMemberInput = z.infer<typeof RemoveTeamMemberBody>;

/**
 * Corps de POST /api/teams/add-member. `userId` OU `email` (vérifié par la
 * route, qui résout l'email en compte) ; une valeur non textuelle de l'un ou
 * l'autre est ignorée, comme avant. `role` inconnu → `player` ; le BattleTag
 * est exigé des rôles jouants (`validateBattleTagForRole`, messages propres).
 */
export const AddMemberBody = z.object({
  userId: z.string().nullish().catch(undefined),
  email: z.string().nullish().catch(undefined),
  role: z.string({ error: 'role invalide.' }).nullish(),
  battleTag: z.string({ error: 'Invalid BattleTag' }).nullish(),
});
export type AddMemberInput = z.infer<typeof AddMemberBody>;

/**
 * Corps de PATCH /api/teams/update-member. Seuls les champs PRÉSENTS sont
 * appliqués (`null` / `''` efface le BattleTag ou le SR). Leur validation
 * dépend du membre visé (rôle actuel → BattleTag exigé, anti-escalade,
 * cohérence rôle ↔ remplaçante) : elle reste dans la route, après lecture
 * du membre, avec ses messages.
 */
export const UpdateMemberBody = z.object({
  memberId: looseUuid('memberId invalide.'),
  role: z.unknown().optional(),
  battle_tag: z.unknown().optional(),
  is_substitute: z.unknown().optional(),
  skill_rating: z.unknown().optional(),
});
export type UpdateMemberInput = z.infer<typeof UpdateMemberBody>;

const PERMISSION_REQUIRED = 'userId et permission requis.';

/**
 * Corps de POST / DELETE /api/teams/member-permissions. `permission` doit
 * appartenir au catalogue (`isTeamPermission`, vérifié par la route).
 */
export const MemberPermissionBody = z.object({
  userId: z
    .string({ error: PERMISSION_REQUIRED })
    .trim()
    .min(1, PERMISSION_REQUIRED),
  permission: z.string({ error: PERMISSION_REQUIRED }),
});
export type MemberPermissionInput = z.infer<typeof MemberPermissionBody>;

/* ------------------------------------------------------------------------
 * Fiche publique d'un membre
 * ---------------------------------------------------------------------- */

/** Texte facultatif : `null` / `''` / blanc effacent, plafonné après trim. */
const optionalProfileText = (max: number) =>
  z
    .string({ error: 'Format invalide.' })
    .trim()
    .max(max, `Trop long (max ${max} caractères).`)
    .nullish();

/**
 * Plafonds de la fiche membre. Miroir de `MEMBER_*_MAX`
 * (utils/markdown/teamPublicMarkdown.ts) — l'égalité est vérifiée par
 * tests/unit/playerSchemasP4.test.ts.
 */
export const MEMBER_PROFILE_LIMITS = {
  displayName: 60,
  pronouns: 20,
  tagline: 120,
  handle: 80,
} as const;

/**
 * Corps de PATCH /api/teams/{teamId}/members/{memberId}/profile, dans l'ordre
 * où la route vérifie les champs. Le poste (tank | dps | support | flex),
 * l'URL d'avatar (http(s), ≤ 300), le format Twitch et le droit de changer
 * `is_substitute` sont vérifiés par la route.
 */
export const TeamMemberProfileBody = z.object({
  display_name: optionalProfileText(MEMBER_PROFILE_LIMITS.displayName),
  specialty: z.string({ error: 'specialty invalide.' }).nullish(),
  avatar_url: z.string({ error: 'avatar_url invalide.' }).nullish(),
  pronouns: optionalProfileText(MEMBER_PROFILE_LIMITS.pronouns),
  tagline: optionalProfileText(MEMBER_PROFILE_LIMITS.tagline),
  twitter: optionalProfileText(MEMBER_PROFILE_LIMITS.handle),
  twitch: optionalProfileText(MEMBER_PROFILE_LIMITS.handle),
  is_substitute: z.boolean({ error: 'is_substitute invalide.' }).nullish(),
});
export type TeamMemberProfileInput = z.infer<typeof TeamMemberProfileBody>;

/* ------------------------------------------------------------------------
 * Images d'équipe
 * ---------------------------------------------------------------------- */

const MISSING_IMAGE = 'Missing data or mimeType';

/**
 * Corps de POST /api/teams/{teamId}/upload-image. Le type accepté (PNG, JPEG,
 * WebP, SVG), le décodage base64 et les octets magiques sont vérifiés par la
 * route.
 */
export const TeamImageUploadBody = z.object({
  data: z.string({ error: MISSING_IMAGE }).min(1, MISSING_IMAGE),
  mimeType: z.string({ error: MISSING_IMAGE }).min(1, MISSING_IMAGE),
  filename: z.string().nullish().catch(undefined),
});
export type TeamImageUploadInput = z.infer<typeof TeamImageUploadBody>;

/**
 * Corps de POST /api/teams/{teamId}/tcg-image. Décodé et vérifié par
 * `decodeImagePayload`, qui rend un `code` stable (`Image refusée.`) : sa
 * forme n'est pas figée ici.
 */
export const TeamTcgImageBody = z.object({
  data: z.unknown().optional(),
  mimeType: z.unknown().optional(),
});
export type TeamTcgImageInput = z.infer<typeof TeamTcgImageBody>;

/* ------------------------------------------------------------------------
 * Page publique de l'équipe
 * ---------------------------------------------------------------------- */

/** Chaîne facultative (`null` efface) ; message historique si autre type. */
const optionalString = (message: string) =>
  z.string({ error: message }).nullish();

const FORMAT_INVALID = 'Format invalide.';

/**
 * Corps de PATCH /api/teams/{teamId}/public-page — les TYPES, avec les
 * messages historiques. Les règles de domaine (plafonds, hex, overlay, point
 * focal, URL http(s), Twitch, succès, sponsors, embed YouTube/Twitch, annonce
 * épinglée) restent dans la route et `utils/markdown/teamPublicMarkdown.ts`.
 */
export const TeamPublicPageBody = z.object({
  description: optionalString(FORMAT_INVALID),
  public_content: optionalString(FORMAT_INVALID),
  accent_color: optionalString('accent_color invalide.'),
  secondary_color: optionalString('secondary_color invalide.'),
  banner_overlay: optionalString('banner_overlay invalide.'),
  banner_focal: optionalString('banner_focal invalide.'),
  logo_url: optionalString('logo_url invalide.'),
  banner_url: optionalString('banner_url invalide.'),
  twitter: optionalString(FORMAT_INVALID),
  discord: optionalString(FORMAT_INVALID),
  youtube: optionalString(FORMAT_INVALID),
  twitch: optionalString(FORMAT_INVALID),
  instagram: optionalString(FORMAT_INVALID),
  tiktok: optionalString(FORMAT_INVALID),
  website: optionalString('website invalide.'),
  achievements: z
    .array(z.unknown(), { error: 'achievements doit être un tableau.' })
    .nullish(),
  sponsors: z
    .array(z.unknown(), { error: 'sponsors doit être un tableau.' })
    .nullish(),
  embed_url: optionalString('embed_url invalide.'),
  pinned_announcement: z.unknown().optional(),
  pinned_announcement_until: z.unknown().optional(),
});
export type TeamPublicPageInput = z.infer<typeof TeamPublicPageBody>;

/* ------------------------------------------------------------------------
 * Vie d'équipe : débriefs, rythme
 * ---------------------------------------------------------------------- */

/**
 * PUT /api/player/team-reviews (corps) et DELETE (query) : le sujet
 * débriefé. VOD, notes et objectifs sont normalisés par
 * `normalizeReviewContent` (utils/teams/teamReviews.ts, messages propres).
 */
export const TeamReviewBody = z.object({
  subjectType: z.enum(REVIEW_SUBJECT_TYPES, {
    error: 'Type de sujet invalide.',
  }),
  subjectId: z
    .string({ error: 'Sujet manquant.' })
    .trim()
    .min(1, 'Sujet manquant.'),
  vodUrl: z.unknown().optional(),
  notes: z.unknown().optional(),
  /** Intentions d'avant-match (lot J5) — même ligne que la revue. */
  objectives: z.unknown().optional(),
});
export type TeamReviewInput = z.infer<typeof TeamReviewBody>;

/**
 * Corps de PUT /api/player/team-rhythm. Les créneaux sont normalisés par
 * `normalizeRhythmSlots` (plafond, format) ; un fuseau inconnu retombe sur le
 * fuseau de référence, comme avant — d'où `.catch`.
 */
export const TeamRhythmBody = z.object(
  {
    slots: z.array(z.unknown(), { error: 'Créneaux invalides.' }),
    timezone: z.string().nullish().catch(undefined),
  },
  { error: 'Créneaux invalides.' }
);
export type TeamRhythmInput = z.infer<typeof TeamRhythmBody>;
