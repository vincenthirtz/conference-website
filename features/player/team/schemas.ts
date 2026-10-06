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

import * as z from 'zod';
import { looseUuid } from '../_shared/zod';
import { REVIEW_SUBJECT_TYPES } from '../../../utils/teams/teamReviews';
import type { TeamPermission } from '../../../utils/teamRoles';

const DEMANDE_ACTION = 'Action invalide. Utilise "approve" ou "reject".';

/**
 * Longueur maximale du motif de refus d'une demande (adhésion / transfert).
 * Le motif est montré tel quel à la candidate (historique de ses demandes,
 * notification) : court par construction.
 */
export const DEMANDE_REJECT_REASON_MAX = 300;

/** Corps de POST /api/teams/transfer-requests. */
export const TransferRequestDecisionBody = z.object({
  demandeId: looseUuid('demandeId invalide.'),
  action: z.enum(['approve', 'reject'], { error: DEMANDE_ACTION }),
  /**
   * Motif du refus, FACULTATIF, saisi par la capitaine et montré à la
   * candidate. Ignoré sur une acceptation. Vide / blanc = pas de motif.
   */
  reason: z
    .string({ error: 'Motif invalide.' })
    .trim()
    .max(
      DEMANDE_REJECT_REASON_MAX,
      `Motif trop long (max ${DEMANDE_REJECT_REASON_MAX} caractères).`
    )
    .nullish(),
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

/* ------------------------------------------------------------------------
 * « Mon équipe » : lecture de la tranche équipe, édition de son identité
 * (GET / PATCH /api/player/team — ex-/api/admin/teams/my, lot P10)
 * ---------------------------------------------------------------------- */

const TEAM_ID_REQUIRED = 'teamId required.';

/**
 * Corps de PATCH /api/player/team. Seul `teamId` est typé ici : les bornes
 * (nom 2-100, sigle ≤ 16, pays ≤ 56, description ≤ 2000, SR, URL http(s))
 * gardent leurs messages historiques dans le service, dans l'ordre où la
 * route les testait. Une clé ABSENTE ne touche à rien ; `null` efface.
 */
export const TeamInfoPatchBody = z.object({
  teamId: z.string({ error: TEAM_ID_REQUIRED }).trim().min(1, TEAM_ID_REQUIRED),
  name: z.unknown().optional(),
  short_name: z.unknown().optional(),
  logo_url: z.unknown().optional(),
  country: z.unknown().optional(),
  description: z.unknown().optional(),
  discord: z.unknown().optional(),
  website: z.unknown().optional(),
  skill_rating: z.unknown().optional(),
});
export type TeamInfoPatchInput = z.infer<typeof TeamInfoPatchBody>;

export type TeamSpecialty = 'tank' | 'dps' | 'support' | 'flex' | null;

/** Membre tel que le renvoie GET /api/player/team. */
export type ManagedTeamMemberDto = {
  id: string;
  user_id: string | null;
  role: string | null;
  /** Pseudo affichable — l'encadrement n'a pas forcément de BattleTag. */
  display_name?: string | null;
  battle_tag: string | null;
  is_substitute: boolean;
  is_captain?: boolean;
  specialty?: TeamSpecialty;
  /** SR Overwatch déclaré (0-5000), `null` si non renseigné. */
  skill_rating?: number | null;
  /** `null` = non vérifié, date = vérifié ; absent = non communiqué. */
  battle_tag_verified_at?: string | null;
  /**
   * Compte Discord lié. TRI-état : absent/`null` quand le serveur ne l'a pas
   * communiqué (il ne le fait que pour qui GÈRE l'équipe) — jamais « non
   * lié » ; cf. utils/teams/rosterReadiness.ts.
   */
  discord_linked?: boolean | null;
  /** Présence constatée sur le serveur Discord par le bot ; `null` = non constaté. */
  discord_in_guild?: boolean | null;
  /** Date (ISO) du constat ci-dessus. */
  discord_checked_at?: string | null;
};

/** Équipe telle que la renvoie GET /api/player/team. */
export type ManagedTeamInfoDto = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
  open_for_scrim?: boolean;
  /** SR d'ensemble déclaré. Court-circuite la moyenne des fiches. */
  skill_rating?: number | null;
};

/** Champs d'identité éditables depuis l'écran capitaine. */
export type TeamIdentityField = 'name' | 'short_name' | 'country';

/**
 * Invitation SORTANTE en attente (GET /api/teams/invitations). À ne pas
 * confondre avec `TeamJoinRequestDto`, qui va dans l'autre sens.
 */
export type SentInvitationDto = {
  id: string;
  email: string | null;
  role: string | null;
  battle_tag: string | null;
  set_captain: boolean;
  created_at: string;
  expires_at: string | null;
  expired: boolean;
  has_invite_link: boolean;
  /** Canal de l'invitation (`website`, `discord_bot`…). */
  source: string | null;
};

/** Demande ENTRANTE à rejoindre l'équipe (GET /api/teams/join-requests). */
export type TeamJoinRequestDto = {
  id: string;
  user_id: string;
  status: string;
  comment: string | null;
  payload: {
    user_display_name?: string;
    user_battle_tag?: string;
    desired_role?: string;
  } | null;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
    /** Pseudo Discord du profil, s'il est connu (lot P8). */
    discord?: string | null;
  } | null;
};

const INVITE_ROLES = [
  'player',
  'substitute',
  'coach',
  'manager',
  'captain',
] as const;
/** Rôle proposé à l'invitation ; `captain` = désigner la capitaine. */
export type InviteRoleChoice = (typeof INVITE_ROLES)[number];

/** Réponse de POST /api/teams/invitations (et de la relance). */
export type InvitationSentDto = {
  invite_url: string;
  email_sent: boolean;
  expires_at?: string | null;
};

/**
 * Formulaire « Inviter par e-mail » (useSchemaForm). L'adresse est vérifiée
 * par le serveur, qui porte ses messages ; le client n'exige qu'une saisie
 * (le bouton reste désactivé tant qu'elle est vide, comme avant).
 */
export const InviteFormSchema = z.object({
  email: z.string().trim().min(1),
  role: z.enum(INVITE_ROLES),
});

/* ------------------------------------------------------------------------
 * Droits délégués (J3) — GET / POST / DELETE /api/teams/member-permissions
 * ---------------------------------------------------------------------- */

/**
 * Droits d'UN membre, décomposés par SOURCE : « vient de son rôle » (non
 * retirable ici) vs « délégué » (révocable) — sans que l'écran connaisse la
 * config des rôles, qui vit côté serveur.
 */
export type TeamMemberPermissionState = {
  userId: string;
  role: string | null;
  fromRole: TeamPermission[];
  granted: TeamPermission[];
  effective: TeamPermission[];
};

export type TeamPermissionGrant = {
  userId: string;
  permission: TeamPermission;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
};

/** Réponse de GET /api/teams/member-permissions. */
export type TeamMemberRightsResponse = {
  teamId: string;
  grants: TeamPermissionGrant[];
  members: TeamMemberPermissionState[];
  /** Ce que l'appelant peut déléguer : jamais plus que ce qu'il a. */
  delegatable: TeamPermission[];
};

/** Réponse de POST / DELETE /api/teams/member-permissions. */
export type TeamMemberRightChange = {
  granted: boolean;
  permission: TeamPermission;
  userId: string;
};

/* ------------------------------------------------------------------------
 * Éditeur de page publique — /team/[slug]/edit (SSR) et PATCH public-page
 * ---------------------------------------------------------------------- */

/** Équipe telle que la charge l'éditeur (colonnes éditables, en l'état). */
export type EditableTeamDto = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  /** Chemin de bucket ; l'URL publique est résolue à part (`tcgImageUrl`). */
  tcg_image_path: string | null;
  banner_url: string | null;
  description: string | null;
  public_content: string | null;
  accent_color: string | null;
  secondary_color: string | null;
  banner_overlay: string | null;
  banner_focal: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  youtube: string | null;
  twitch: string | null;
  instagram: string | null;
  tiktok: string | null;
  achievements:
    | { title: string; date: string | null; tournament: string | null }[]
    | null;
  sponsors:
    | { name: string; logo_url: string | null; url: string | null }[]
    | null;
  embed_provider: string | null;
  embed_id: string | null;
  pinned_announcement: string | null;
  pinned_announcement_until: string | null;
  captain_id: string | null;
};

/** Membre éditable (fiche publique du membre), capitanat affiché. */
export type EditableMemberDto = {
  id: string;
  user_id: string;
  battle_tag: string | null;
  role: string | null;
  is_captain: boolean;
  is_substitute: boolean;
  display_name: string | null;
  specialty: string | null;
  avatar_url: string | null;
  pronouns: string | null;
  tagline: string | null;
  twitter: string | null;
  twitch: string | null;
};

/** Props de l'éditeur, rendues par le service. */
export type TeamPageEditorData = {
  team: EditableTeamDto;
  /** URL publique de l'illustration TCG, `null` si l'équipe n'en a pas. */
  tcgImageUrl: string | null;
  members: EditableMemberDto[];
};

const editorText = z.string();
const editorList = <T extends z.ZodType>(item: T) => z.array(item);

/**
 * Formulaire de l'éditeur (useSchemaForm) : valeurs des CHAMPS → corps de
 * PATCH /api/teams/{teamId}/public-page, tel que la page l'envoyait. Les
 * règles (longueurs, couleurs, URLs, intégration) restent celles du serveur ;
 * couleur et intégration invalides sont signalées avant l'envoi par l'écran.
 */
export const TeamPageEditorForm = z
  .object({
    description: editorText,
    public_content: editorText,
    accent_color: editorText,
    secondary_color: editorText,
    banner_overlay: editorText,
    banner_focal: editorText,
    logo_url: editorText,
    banner_url: editorText,
    twitter: editorText,
    discord: editorText,
    website: editorText,
    youtube: editorText,
    twitch: editorText,
    instagram: editorText,
    tiktok: editorText,
    achievements: editorList(
      z.object({
        title: z.string(),
        date: z.string().nullable(),
        tournament: z.string().nullable(),
      })
    ),
    sponsors: editorList(
      z.object({
        name: z.string(),
        logo_url: z.string().nullable(),
        url: z.string().nullable(),
      })
    ),
    embed_url: editorText,
    pinned_announcement: editorText,
    /** `datetime-local` (heure locale) ; converti en ISO à l'envoi. */
    pinned_until: editorText,
  })
  .transform(({ embed_url, pinned_until, ...rest }) => ({
    ...rest,
    embed_url: embed_url || null,
    pinned_announcement_until: pinned_until
      ? new Date(pinned_until).toISOString()
      : null,
  }));
export type TeamPageEditorValues = z.input<typeof TeamPageEditorForm>;
export type TeamPageEditorPayload = z.output<typeof TeamPageEditorForm>;
