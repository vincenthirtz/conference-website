// features/admin/moderation/schemas.ts — blacklists (joueurs, entités), journal
// des alertes de détection, tickets support et leur conversion en blacklist
// (`/api/admin/moderation/**`, `/api/admin/support/**`). Ref :
// docs/BLACKLIST_DESIGN.md.
//
// Les corps sont validés par le SERVICE avec `parseWithLegacyFields` : ces
// routes répondaient `{ error, fields: { champ: [messages] } }`, forme gardée.
// La route déclare un `looseBody` qui NOMME les champs pour la spec.
//
// zod seul, imports RELATIFS : schémas référencés par la spec OpenAPI.

import * as z from 'zod';
import {
  looseBody,
  looseQuery,
  uuidPathParam,
} from '../../../utils/admin/pathParams';
import { BLACKLIST_MAX_DURATION_DAYS } from '../../../utils/moderation/blacklistExpiry';

export { querySchema as BlacklistAlertsQuery } from '../../../lib/apiContracts/admin/moderation/blacklist/alerts.query';

/* ---------------------------------------------------------------------------
 * Colonnes
 * ------------------------------------------------------------------------ */

export const PLAYER_BLACKLIST_COLUMNS =
  'id, tenant_id, battle_tag, display_name, discord_user_id, reason, notes, banned_by, active, created_at, updated_at' as const;

export const ENTITY_BLACKLIST_COLUMNS =
  'id, tenant_id, entity_type, name, reason, notes, banned_by, active, created_at, updated_at' as const;

/** Échéance des sanctions temporaires (migration blacklist_expires_at). */
export const BLACKLIST_EXPIRY_COLUMN = 'expires_at' as const;

export const BLACKLIST_ALERT_COLUMNS =
  'id, created_at, discord_user_id, battle_tag, display_name, matched_on, strength, source, context, reason, blacklist_entry_id' as const;

/** Liste staff des tickets (page + filtres). */
export const SUPPORT_TICKET_LIST_COLUMNS =
  'id, tournament_id, reporter_name, reporter_email, is_anonymous, category, severity, subject, message, status, resolved_at, resolution_note, source, discord_user_id, discord_username, reported_target_type, reported_target_name, reported_battle_tag, converted_player_blacklist_id, converted_entity_blacklist_id, created_at, updated_at' as const;

/** Ticket COMPLET (ex-`select('*')` de la fiche et de sa mise à jour). */
export const SUPPORT_TICKET_ROW_COLUMNS =
  'id, tenant_id, tournament_id, reporter_user_id, reporter_name, reporter_email, is_anonymous, category, severity, subject, message, status, resolved_at, resolved_by, resolution_note, source, discord_user_id, discord_username, discord_message_id, reported_target_type, reported_target_name, reported_battle_tag, converted_player_blacklist_id, converted_entity_blacklist_id, created_at, updated_at' as const;

/* ---------------------------------------------------------------------------
 * Constantes
 * ------------------------------------------------------------------------ */

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
export const TICKET_SEVERITIES = ['low', 'medium', 'high'] as const;
export const TICKET_CATEGORIES = [
  'dispute',
  'behavior',
  'technical',
  'other',
  'roster_unlock',
] as const;
export const TICKET_SEARCH_MAX_LENGTH = 100;

/* ---------------------------------------------------------------------------
 * Paramètres
 * ------------------------------------------------------------------------ */

/* Filtres de liste : nommés pour la spec, normalisés par le service. */

// `expired=true` : sanctions temporaires échues (levées ou en attente du cron).
export const BlacklistListQuery = looseQuery([
  'search',
  'active',
  'expired',
  'limit',
  'offset',
]);

export const EntityBlacklistListQuery = looseQuery([
  'search',
  'active',
  'expired',
  'entity_type',
  'limit',
  'offset',
]);

export const SupportTicketListQuery = looseQuery([
  'status',
  'severity',
  'category',
  'tournament_id',
  'search',
  // `oldest` : plus anciens d'abord (file de traitement) ; défaut récents.
  'sort',
  // `me` (à moi) / `unassigned` (non assignés) — migration d'assignation.
  'assigned',
  'limit',
  'offset',
]);

export const BlacklistEntryIdQuery = z.looseObject({
  id: uuidPathParam('Missing or invalid ID.'),
});

export const TicketIdQuery = z.looseObject({
  id: uuidPathParam('Invalid ticket id'),
});

export const ConvertTicketIdQuery = z.looseObject({
  id: uuidPathParam('Missing or invalid ticket ID.'),
});

/* ---------------------------------------------------------------------------
 * Corps
 * ------------------------------------------------------------------------ */

const discordUserId = z
  .string()
  .trim()
  .regex(/^[0-9]{15,25}$/, 'discord_user_id invalide.')
  .optional()
  .nullable();

/**
 * Sanction temporaire : date explicite OU durée en jours (l'une ou l'autre ;
 * `expires_at` l'emporte). `null` = sans échéance. Résolu par
 * `resolveBlacklistExpiry` (utils/moderation/blacklistExpiry.ts).
 */
const expiryFields = {
  expires_at: z
    .string()
    .datetime({ offset: true, message: 'expires_at invalide (ISO 8601).' })
    .optional()
    .nullable(),
  duration_days: z
    .number()
    .int()
    .min(1)
    .max(BLACKLIST_MAX_DURATION_DAYS)
    .optional()
    .nullable(),
};

const playerIdentifiers = {
  battle_tag: z.string().trim().max(190).optional().nullable(),
  display_name: z.string().trim().max(190).optional().nullable(),
  discord_user_id: discordUserId,
  reason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
};

const atLeastOneIdentifier = {
  check: (v: {
    battle_tag?: string | null;
    display_name?: string | null;
    discord_user_id?: string | null;
  }) => !!(v.battle_tag?.trim() || v.display_name?.trim() || v.discord_user_id),
  message:
    'Au moins un identifiant requis (battle_tag, display_name ou discord_user_id).',
};

// Au moins un identifiant requis (CHECK DB miroir côté app pour renvoyer un
// 400 propre plutôt qu'une erreur Postgres brute).
export const BlacklistCreateBody = z
  .object({ ...playerIdentifiers, ...expiryFields })
  .refine(atLeastOneIdentifier.check, {
    message: atLeastOneIdentifier.message,
  });
export type BlacklistCreateInput = z.output<typeof BlacklistCreateBody>;

export const BlacklistUpdateBody = z
  .object({
    reason: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    active: z.boolean().optional(),
    ...expiryFields,
  })
  .refine(
    (v) =>
      v.reason !== undefined ||
      v.notes !== undefined ||
      v.active !== undefined ||
      v.expires_at !== undefined ||
      v.duration_days !== undefined,
    { message: 'Aucun champ à mettre à jour.' }
  );

const entityFields = {
  entity_type: z.enum(['team', 'org']),
  name: z.string().trim().min(1, 'Le nom est requis.').max(190),
  reason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
};

export const EntityBlacklistCreateBody = z.object({
  ...entityFields,
  ...expiryFields,
});
export type EntityBlacklistCreateInput = z.output<
  typeof EntityBlacklistCreateBody
>;

export const EntityBlacklistUpdateBody = z
  .object({
    name: z.string().trim().min(1, 'Le nom est requis.').max(190).optional(),
    entity_type: z.enum(['team', 'org']).optional(),
    reason: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    active: z.boolean().optional(),
    ...expiryFields,
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.entity_type !== undefined ||
      v.reason !== undefined ||
      v.notes !== undefined ||
      v.active !== undefined ||
      v.expires_at !== undefined ||
      v.duration_days !== undefined,
    { message: 'Aucun champ à mettre à jour.' }
  );

/** Conversion d'un ticket, `kind: 'player'` — miroir de la création joueur. */
export const ConvertPlayerBody = z
  .object({ kind: z.literal('player'), ...playerIdentifiers })
  .refine(atLeastOneIdentifier.check, {
    message: atLeastOneIdentifier.message,
  });

/** Conversion d'un ticket, `kind: 'entity'` — miroir de la création entité. */
export const ConvertEntityBody = z.object({
  kind: z.literal('entity'),
  ...entityFields,
});

/* ---------------------------------------------------------------------------
 * Corps déclarés par les routes (champs nommés pour la spec ; la validation
 * stricte ci-dessus est faite par le service, sur le corps brut)
 * ------------------------------------------------------------------------ */

export const BlacklistCreateDoc = looseBody([
  'battle_tag',
  'display_name',
  'discord_user_id',
  'reason',
  'notes',
  'expires_at',
  'duration_days',
]);

export const BlacklistUpdateDoc = looseBody([
  'reason',
  'notes',
  'active',
  'expires_at',
  'duration_days',
]);

export const EntityBlacklistCreateDoc = looseBody([
  'entity_type',
  'name',
  'reason',
  'notes',
  'expires_at',
  'duration_days',
]);

export const EntityBlacklistUpdateDoc = looseBody([
  'name',
  'entity_type',
  'reason',
  'notes',
  'active',
  'expires_at',
  'duration_days',
]);

/* ---------------------------------------------------------------------------
 * Commentaires d'actualités — statut, actions en masse, réglages
 * (`/api/admin/moderation/comments/**`, migration news_comments_moderation)
 * ------------------------------------------------------------------------ */

export const COMMENT_BULK_ACTIONS = ['show', 'hide', 'delete'] as const;
export const COMMENT_BULK_MAX = 100;

/** `status` : visible | pending | hidden (absent = tous). */
export const CommentModerationListQuery = looseQuery([
  'status',
  'search',
  'news_id',
  'limit',
  'offset',
]);

export const CommentBulkBody = z.object({
  ids: z
    .array(z.string().uuid('Identifiant de commentaire invalide.'))
    .min(1, 'Aucun commentaire sélectionné.')
    .max(COMMENT_BULK_MAX, `Au plus ${COMMENT_BULK_MAX} commentaires.`),
  action: z.enum(COMMENT_BULK_ACTIONS),
});

export const CommentSettingsBody = z.object({
  pre_moderation: z.boolean(),
});

export const CommentArticleClosureBody = z.object({
  news_id: z.string().uuid('Identifiant d’article invalide.'),
  comments_closed: z.boolean(),
});

export const SupportTicketPatchBody = looseBody([
  'status',
  'resolution_note',
  // Booléen : prévenir l'auteur·ice (email) — avec `resolved` / `closed` seulement.
  'notify_reporter',
]);

export const ConvertBlacklistDoc = looseBody([
  'kind',
  'battle_tag',
  'display_name',
  'discord_user_id',
  'entity_type',
  'name',
  'reason',
  'notes',
]);
