// features/admin/logs/schemas.ts — journaux lus par /admin/logs : journal
// staff (`staff_logs`), journal du bot Discord, historique d'une entité.
//
// Filtres « historiques » : NOMMÉS pour la spec (`looseQuery`), lus et
// normalisés par le service (valeurs non conformes ignorées ou 400 avec le
// message d'origine).
//
// zod seul, imports RELATIFS : lu par l'assemblage OpenAPI (Node sans `@/`).

import { looseQuery } from '../../../utils/admin/pathParams';

/** GET /api/admin/logs (JSON paginé ou `format=csv`). */
export const StaffLogsQuery = looseQuery([
  'staffId',
  'tournamentId',
  'entityType',
  'matchId',
  'stageId',
  'teamId',
  'userId',
  'action',
  'from',
  'to',
  'search',
  'limit',
  'offset',
  'orderDir',
  'includeTotal',
  'format',
  'export',
]);

/** GET /api/admin/discord-logs (JSON paginé ou `format=csv`). */
export const DiscordLogsQuery = looseQuery([
  'source',
  'action',
  'entityType',
  'actorDiscordUserId',
  'targetDiscordUserId',
  'status',
  'from',
  'to',
  'search',
  'limit',
  'offset',
  'includeTotal',
  'format',
  'export',
]);

/** GET /api/admin/entity-history?type=&id= */
export const EntityHistoryQuery = looseQuery(['type', 'id']);

/**
 * Types d'entité exposés. Liste FERMÉE : `entity_type` est du texte libre en
 * base, laisser le client choisir ferait de la route un lecteur universel du
 * journal.
 */
export const HISTORY_ENTITY_TYPES = [
  'team',
  'tournament',
  'user',
  'support_ticket',
  'event_run',
  // L'espace lui-même (T9) — cas particulier assumé (portée : cf. service).
  'tenant',
  // Fiche Le Ruban des chaînes Twitch (avant / après écrits par L8).
  'twitch_channel',
] as const;

export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];
