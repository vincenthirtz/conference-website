// lib/apiContracts/admin/features.ts — schémas des routes admin MIGRÉES sur
// `defineAdminRoute` (docs/PLAN-industrialisation-admin.md, lot L9).
//
// Les schémas vivent dans leur module (`features/admin/<domaine>/schemas.ts`,
// zod seul) : la route les applique, la spec les référence (`x-zod`,
// `x-zod-query`). `tests/unit/adminRouteContracts.test.ts` vérifie que le
// schéma documenté est LE MÊME objet que celui de la route — pas une copie.
//
// Chemins relatifs, comme le reste de lib/apiContracts : l'assembleur tourne
// aussi dans le script de build.

import type { ApiContractEntry } from '../index';
import {
  TwitchChannelBody,
  TwitchChannelIdQuery,
  TwitchChannelListQuery,
  TwitchChannelPatch,
} from '../../../features/admin/diffusion/schemas';
import { RemoveFreePlayerQuery } from '../../../features/admin/free-players/schemas';
import { UserSearchQuery } from '../../../features/admin/users/schemas';
import { AlertsSummaryQuery } from '../../../features/admin/dashboard/schemas';
import {
  AdherentCreateBody,
  AdherentListQuery,
} from '../../../features/admin/adherents/schemas';
import {
  LeagueIdQuery,
  LeagueSubRouteQuery,
  LeagueTournamentQuery,
} from '../../../features/admin/leagues/schemas';
import {
  DiscordWebhookDeleteQuery,
  SiteSettingKeyQuery,
} from '../../../features/admin/site-settings/schemas';
import { NewsIdQuery } from '../../../features/admin/news/schemas';
import { PartnerIdQuery } from '../../../features/admin/partners/schemas';
import { PoleMemberIdQuery } from '../../../features/admin/pole-members/schemas';
import { CastMemberIdQuery } from '../../../features/admin/cast-members/schemas';
import {
  AssignTaskBody,
  BoardIdQuery,
  ChecklistItemIdQuery,
  ColumnIdQuery,
  CommentIdQuery,
  CreateBoardBody,
  CreateChecklistItemBody,
  CreateColumnBody,
  CreateCommentBody,
  CreateLabelBody,
  CreateTaskBody,
  DeletedTasksQuery,
  LabelIdQuery,
  ListBoardsQuery,
  MoveTaskBody,
  PatchBoardBody,
  PatchChecklistItemBody,
  PatchColumnBody,
  PatchLabelBody,
  PatchTaskBody,
  TaskIdQuery,
} from '../../../features/admin/tasks/schemas';
import {
  PlanningAvailabilityBody,
  PlanningConflictsLooseBody,
  PlanningCreateLooseBody,
  PlanningIdQuery,
  PlanningListQuery,
  PlanningPatchBody,
  PlanningValidateBody,
  ScrimCalendarQuery,
  ScrimCastAssignmentBody,
  ScrimCreateBody,
  ScrimForwardBody,
  ScrimIdQuery,
  ScrimIdUuidQuery,
  ScrimListQuery,
  ScrimMatchesBody,
  ScrimPatchBody,
  ScrimResultLooseBody,
} from '../../../features/admin/scrims/schemas';
import {
  BlacklistCreateDoc,
  BlacklistEntryIdQuery,
  BlacklistListQuery,
  BlacklistUpdateDoc,
  ConvertBlacklistDoc,
  ConvertTicketIdQuery,
  EntityBlacklistCreateDoc,
  EntityBlacklistListQuery,
  EntityBlacklistUpdateDoc,
  SupportTicketListQuery,
  SupportTicketPatchBody,
  TicketIdQuery,
} from '../../../features/admin/moderation/schemas';
import {
  ApplicationIdQuery,
  CircuitApplicationListQuery,
  DecisionDoc,
} from '../../../features/admin/circuit-partners/schemas';
import {
  MapStatsQuery,
  TeamStatsQuery,
} from '../../../features/admin/stats/schemas';

export const ADMIN_FEATURE_BODY_SCHEMAS: Record<string, ApiContractEntry> = {
  'admin.twitchChannels.create': { schema: TwitchChannelBody, io: 'input' },
  'admin.twitchChannels.update': { schema: TwitchChannelPatch, io: 'input' },
  'admin.adherents.create': { schema: AdherentCreateBody, io: 'input' },
  // Kanban interne (features/admin/tasks).
  'admin.tasks.boards.create': { schema: CreateBoardBody, io: 'input' },
  'admin.tasks.boards.update': { schema: PatchBoardBody, io: 'input' },
  'admin.tasks.columns.create': { schema: CreateColumnBody, io: 'input' },
  'admin.tasks.columns.update': { schema: PatchColumnBody, io: 'input' },
  'admin.tasks.tasks.create': { schema: CreateTaskBody, io: 'input' },
  'admin.tasks.tasks.update': { schema: PatchTaskBody, io: 'input' },
  'admin.tasks.tasks.move': { schema: MoveTaskBody, io: 'input' },
  'admin.tasks.tasks.assign': { schema: AssignTaskBody, io: 'input' },
  'admin.tasks.comments.create': { schema: CreateCommentBody, io: 'input' },
  'admin.tasks.checklist.create': {
    schema: CreateChecklistItemBody,
    io: 'input',
  },
  'admin.tasks.checklist.update': {
    schema: PatchChecklistItemBody,
    io: 'input',
  },
  'admin.tasks.labels.create': { schema: CreateLabelBody, io: 'input' },
  'admin.tasks.labels.update': { schema: PatchLabelBody, io: 'input' },
  // Scrims, grilles de dispos, modération, support, circuits (S2). Les corps
  // « historiques » sont des `looseBody` : champs nommés, validés par le service.
  'admin.scrims.create': { schema: ScrimCreateBody, io: 'input' },
  'admin.scrims/[scrimId].update': { schema: ScrimPatchBody, io: 'input' },
  'admin.scrims/[scrimId]/result.body': {
    schema: ScrimResultLooseBody,
    io: 'input',
  },
  'admin.scrims/[scrimId]/matches.create': {
    schema: ScrimMatchesBody,
    io: 'input',
  },
  'admin.scrims/[scrimId]/cast-assignments.create': {
    schema: ScrimCastAssignmentBody,
    io: 'input',
  },
  'admin.scrims/forward.body': { schema: ScrimForwardBody, io: 'input' },
  'admin.scrim-plannings.create': {
    schema: PlanningCreateLooseBody,
    io: 'input',
  },
  'admin.scrim-plannings/[planningId].update': {
    schema: PlanningPatchBody,
    io: 'input',
  },
  'admin.scrim-plannings/[planningId]/availability.update': {
    schema: PlanningAvailabilityBody,
    io: 'input',
  },
  'admin.scrim-plannings/[planningId]/conflicts.body': {
    schema: PlanningConflictsLooseBody,
    io: 'input',
  },
  'admin.scrim-plannings/[planningId]/validate.body': {
    schema: PlanningValidateBody,
    io: 'input',
  },
  'admin.moderation/blacklist.create': {
    schema: BlacklistCreateDoc,
    io: 'input',
  },
  'admin.moderation/blacklist/[id].update': {
    schema: BlacklistUpdateDoc,
    io: 'input',
  },
  'admin.moderation/entity-blacklist.create': {
    schema: EntityBlacklistCreateDoc,
    io: 'input',
  },
  'admin.moderation/entity-blacklist/[id].update': {
    schema: EntityBlacklistUpdateDoc,
    io: 'input',
  },
  'admin.support/tickets/[id].update': {
    schema: SupportTicketPatchBody,
    io: 'input',
  },
  'admin.support/tickets/[id]/convert-blacklist.body': {
    schema: ConvertBlacklistDoc,
    io: 'input',
  },
  'admin.circuit-partners/[id].decision': { schema: DecisionDoc, io: 'input' },
};

export const ADMIN_FEATURE_QUERY_SCHEMAS: Record<string, ApiContractEntry> = {
  'admin.free-players.query': { schema: RemoveFreePlayerQuery, io: 'input' },
  'admin.twitch-channels.query': {
    schema: TwitchChannelListQuery,
    io: 'input',
  },
  'admin.twitch-channels/[id].query': {
    schema: TwitchChannelIdQuery,
    io: 'input',
  },
  'admin.users/search.query': { schema: UserSearchQuery, io: 'input' },
  'admin.alerts-summary.query': { schema: AlertsSummaryQuery, io: 'input' },
  'admin.adherents.query': { schema: AdherentListQuery, io: 'input' },
  'admin.leagues/[id].query': { schema: LeagueIdQuery, io: 'input' },
  // recompute, standings et tournaments partagent le même schéma.
  'admin.leagues/[id]/sub.query': {
    schema: LeagueSubRouteQuery,
    io: 'input',
  },
  'admin.leagues/[id]/tournaments/[tournamentId].query': {
    schema: LeagueTournamentQuery,
    io: 'input',
  },
  'admin.site-settings/[key].query': {
    schema: SiteSettingKeyQuery,
    io: 'input',
  },
  'admin.site-settings/discord-webhooks.query': {
    schema: DiscordWebhookDeleteQuery,
    io: 'input',
  },
  'admin.news/[id].query': { schema: NewsIdQuery, io: 'input' },
  'admin.partners/[id].query': { schema: PartnerIdQuery, io: 'input' },
  'admin.pole-members/[id].query': {
    schema: PoleMemberIdQuery,
    io: 'input',
  },
  'admin.cast-members/[id].query': {
    schema: CastMemberIdQuery,
    io: 'input',
  },
  // Kanban interne (features/admin/tasks). `tasks/[id]` couvre aussi ses
  // sous-routes (move, assign, restore, comments, checklist, activity).
  'admin.tasks/boards.query': { schema: ListBoardsQuery, io: 'input' },
  'admin.tasks/boards/[id].query': { schema: BoardIdQuery, io: 'input' },
  'admin.tasks/columns/[id].query': { schema: ColumnIdQuery, io: 'input' },
  'admin.tasks/tasks/[id].query': { schema: TaskIdQuery, io: 'input' },
  'admin.tasks/labels/[id].query': { schema: LabelIdQuery, io: 'input' },
  'admin.tasks/comments/[id].query': { schema: CommentIdQuery, io: 'input' },
  'admin.tasks/checklist/[id].query': {
    schema: ChecklistItemIdQuery,
    io: 'input',
  },
  'admin.tasks/deleted.query': { schema: DeletedTasksQuery, io: 'input' },
  // Scrims, grilles de dispos, modération, support, circuits, stats (S2).
  'admin.scrims.query': { schema: ScrimListQuery, io: 'input' },
  'admin.scrims/calendar.query': { schema: ScrimCalendarQuery, io: 'input' },
  // fiche, matchs et casters d'un scrim partagent le même schéma.
  'admin.scrims/[scrimId].query': { schema: ScrimIdQuery, io: 'input' },
  'admin.scrims/[scrimId]/result.query': {
    schema: ScrimIdUuidQuery,
    io: 'input',
  },
  'admin.scrim-plannings.query': { schema: PlanningListQuery, io: 'input' },
  // fiche, dispos, conflits et validation d'une grille partagent le même schéma.
  'admin.scrim-plannings/[planningId].query': {
    schema: PlanningIdQuery,
    io: 'input',
  },
  'admin.moderation/blacklist.query': {
    schema: BlacklistListQuery,
    io: 'input',
  },
  // blacklist/[id] et entity-blacklist/[id] partagent le même schéma.
  'admin.moderation/blacklist/[id].query': {
    schema: BlacklistEntryIdQuery,
    io: 'input',
  },
  'admin.moderation/entity-blacklist.query': {
    schema: EntityBlacklistListQuery,
    io: 'input',
  },
  'admin.support/tickets.query': {
    schema: SupportTicketListQuery,
    io: 'input',
  },
  'admin.support/tickets/[id].query': { schema: TicketIdQuery, io: 'input' },
  'admin.support/tickets/[id]/convert-blacklist.query': {
    schema: ConvertTicketIdQuery,
    io: 'input',
  },
  'admin.circuit-partners.query': {
    schema: CircuitApplicationListQuery,
    io: 'input',
  },
  'admin.circuit-partners/[id].query': {
    schema: ApplicationIdQuery,
    io: 'input',
  },
  'admin.stats/teams.query': { schema: TeamStatsQuery, io: 'input' },
  'admin.stats/maps.query': { schema: MapStatsQuery, io: 'input' },
};
