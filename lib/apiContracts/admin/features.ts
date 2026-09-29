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
  RatingSeedBody,
  RatingSeedingPreviewQuery,
  SeedingPreviewQuery,
  SnapshotListQuery,
  StageAdvanceBody,
  StageAutoByesBody,
  StageAutoSeedBody,
  StageBatchScoresBody,
  StageBulkMatchesBody,
  StageCloneBody,
  StageDeleteQuery,
  StageGroupMatchesBody,
  StageGroupsBody,
  StageHistoryQuery,
  StageIdQuery,
  StageLobbyCreateBody,
  StageManualSeedBody,
  StageSnapshotBody,
  StageStandingsQuery,
  StageSwissRoundBody,
  StageTeamsBody,
  StageUpdateBody,
  TiebreakerOverrideBody,
} from '../../../features/admin/stages/schemas';
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
import {
  CreateCueDoc,
  CreateRunDoc,
  CreateSegmentDoc,
  CreateStationDoc,
  CreateWaveDoc,
  CueIdQuery,
  CueListQuery,
  FromScrimDoc,
  FromTournamentDoc,
  ReorderSegmentsDoc,
  ReorderWavesDoc,
  RunIdQuery,
  RunListQuery,
  SegmentIdQuery,
  StationIdQuery,
  UpdateRunDoc,
  UpdateSegmentDoc,
  UpdateStationDoc,
  UpdateWaveDoc,
  WaveIdQuery,
} from '../../../features/admin/events/schemas';
import { BroadcastStatePatchDoc } from '../../../features/admin/diffusion/schemas';
import {
  CampaignIdQuery,
  CampaignInputDoc,
  CampaignListQuery,
  CampaignPreviewQuery,
  CampaignScheduleDoc,
  CampaignSendDoc,
} from '../../../features/admin/communications/schemas';
import {
  MapPoolCreateDoc,
  MapPoolIdQuery,
  MapPoolImportDoc,
  MapPoolListQuery,
  MapPoolPatchDoc,
} from '../../../features/admin/map-pool/schemas';
import {
  PresetCreateDoc,
  PresetIdQuery,
  PresetListQuery,
  PresetPatchDoc,
} from '../../../features/admin/custom-game-presets/schemas';
import {
  LobbyIdQuery,
  PlacementsDoc,
} from '../../../features/admin/lobbies/schemas';
import {
  InstagramSecretDoc,
  TiktokCredentialsDoc,
} from '../../../features/admin/social/schemas';
import {
  CreateUserDoc,
  PlayerActionDoc,
  StaffPermissionsDoc,
  UserIdPathQuery,
  UsersManageDeleteDoc,
  UsersManageListQuery,
  UsersManagePatchDoc,
} from '../../../features/admin/users/schemas';
import {
  TcgCatalogueQuery,
  TcgEngagementQuery,
  TcgFanartDecisionDoc,
  TcgFanartListQuery,
  TcgGrantDoc,
  TcgPhotoDecisionDoc,
  TcgPlayersQuery,
} from '../../../features/admin/tcg/schemas';

import {
  ActiveTenantDoc,
  ApiTokenPatchDoc,
  AttachGuildDoc,
  DiscordConfigDoc,
  IdQuery as TenantsIdQuery,
  InvitationCreateDoc,
  LifecycleDoc,
  NonprofitRnaDoc,
  PlanCheckoutDoc,
  RotateSecretsDoc,
  TenantApiTokensQuery,
  TenantCreateDoc,
  TenantGuildQuery,
  TenantInvitationIdQuery,
  TenantPatchDoc,
  TenantRequestListQuery,
  TenantRequestRejectDoc,
  TenantStaffAddDoc,
  TenantStaffIdQuery,
  TenantUsageQuery,
  WebhookCreateDoc,
  WebhookPatchDoc,
} from '../../../features/admin/tenants/schemas';

import {
  CheckinNudgeBody,
  DisputeOpenBody,
  DisputeResolveBody,
  DraftCommitBody,
  DraftInitBody,
  DraftSideBody,
  MatchByIdQuery,
  MatchCastAssignmentBody,
  MatchCastAssignmentIdQuery,
  MatchCastAssignmentPatchBody,
  MatchDisputeQuery,
  MatchDraftQuery,
  MatchIdFrQuery,
  MatchIdQuery,
  MatchLineupBody,
  MatchLineupQuery,
  MatchSearchQuery,
  MatchUpdateBody,
  MvpImportBody,
  MvpPublicLooseBody,
  VetoStepBody,
  VetoUnlockBody,
} from '../../../features/admin/matches/schemas';

import {
  ApplyTemplateBody,
  AutoScheduleBody,
  BracketBody,
  BulkMatchesBody,
  CheckinSettingsBody,
  CloneTournamentBody,
  CodedTournamentIdQuery,
  DashboardQuery,
  DiscordTestBody,
  DiscordWebhookBody,
  DiscordWebhooksQuery,
  ExportResultsQuery,
  NotifyCaptainsBody,
  OverlayDayBody,
  PoolLooseBody,
  PrizePoolLooseBody,
  RosterUnlockBody,
  ScheduleDiagnosticsQuery,
  ScheduleMoveLooseBody,
  StageCreateBody,
  StageReorderBody,
  TournamentCreateBody,
  TournamentDetailQuery,
  TournamentHistoryQuery,
  TournamentIdLowerQuery,
  TournamentIdQuery,
  TournamentListQuery,
  TournamentMatchesCreateBody,
  TournamentMatchesQuery,
  TournamentPatchBody,
  TournamentTeamAddBody,
  TournamentTeamEntryQuery,
  TournamentTeamPatchBody,
  TournamentTeamsQuery,
} from '../../../features/admin/tournaments/schemas';

export const ADMIN_FEATURE_BODY_SCHEMAS: Record<string, ApiContractEntry> = {
  // Tournoi : hub, structure, équipes, matchs, planning, exploitation
  // (features/admin/tournaments, vague serveur 3). Corps « historiques » en
  // `looseBody` : champs nommés, validés par le service.
  'admin.tournaments.create': { schema: TournamentCreateBody, io: 'input' },
  'admin.tournament/[id].update': { schema: TournamentPatchBody, io: 'input' },
  'admin.tournament/[id]/apply-template.body': {
    schema: ApplyTemplateBody,
    io: 'input',
  },
  'admin.tournament/[id]/clone.body': {
    schema: CloneTournamentBody,
    io: 'input',
  },
  'admin.tournament/[id]/overlay-day.update': {
    schema: OverlayDayBody,
    io: 'input',
  },
  'admin.tournament/[id]/roster-unlock.body': {
    schema: RosterUnlockBody,
    io: 'input',
  },
  'admin.tournament/[id]/checkin-settings.update': {
    schema: CheckinSettingsBody,
    io: 'input',
  },
  'admin.tournament/[id]/discord-test.body': {
    schema: DiscordTestBody,
    io: 'input',
  },
  'admin.tournament/[id]/discord-webhooks.update': {
    schema: DiscordWebhookBody,
    io: 'input',
  },
  'admin.tournament/[id]/stages.create': {
    schema: StageCreateBody,
    io: 'input',
  },
  'admin.tournament/[id]/stages.update': {
    schema: StageReorderBody,
    io: 'input',
  },
  'admin.tournament/[id]/teams.create': {
    schema: TournamentTeamAddBody,
    io: 'input',
  },
  'admin.tournament/[id]/teams/[teamId].update': {
    schema: TournamentTeamPatchBody,
    io: 'input',
  },
  'admin.tournament/[id]/matches.create': {
    schema: TournamentMatchesCreateBody,
    io: 'input',
  },
  'admin.tournament/[id]/bracket.body': { schema: BracketBody, io: 'input' },
  'admin.tournament/[id]/bulk-matches.body': {
    schema: BulkMatchesBody,
    io: 'input',
  },
  'admin.tournament/[id]/auto-schedule.body': {
    schema: AutoScheduleBody,
    io: 'input',
  },
  'admin.tournament/[id]/schedule-move.body': {
    schema: ScheduleMoveLooseBody,
    io: 'input',
  },
  'admin.tournament/[id]/pool.body': { schema: PoolLooseBody, io: 'input' },
  'admin.tournaments/[id]/prize-pool.update': {
    schema: PrizePoolLooseBody,
    io: 'input',
  },
  'admin.tournaments/notify-captains.body': {
    schema: NotifyCaptainsBody,
    io: 'input',
  },
  // Phases de tournoi (features/admin/stages, vague serveur 3) : corps
  // « historiques » NOMMÉS, contrôlés par le service (messages d’origine).
  'admin.stages/[stageId].update': { schema: StageUpdateBody, io: 'input' },
  'admin.stages/[stageId]/clone.body': { schema: StageCloneBody, io: 'input' },
  'admin.stages/[stageId]/advance.body': {
    schema: StageAdvanceBody,
    io: 'input',
  },
  'admin.stages/[stageId]/auto-seed.body': {
    schema: StageAutoSeedBody,
    io: 'input',
  },
  'admin.stages/[stageId]/manual-seed.body': {
    schema: StageManualSeedBody,
    io: 'input',
  },
  'admin.stages/[stageId]/rating-seed.body': {
    schema: RatingSeedBody,
    io: 'input',
  },
  'admin.stages/[stageId]/auto-byes.body': {
    schema: StageAutoByesBody,
    io: 'input',
  },
  'admin.stages/[stageId]/batch-scores.body': {
    schema: StageBatchScoresBody,
    io: 'input',
  },
  'admin.stages/[stageId]/bulk-matches.body': {
    schema: StageBulkMatchesBody,
    io: 'input',
  },
  'admin.stages/[stageId]/generate-group-matches.body': {
    schema: StageGroupMatchesBody,
    io: 'input',
  },
  'admin.stages/[stageId]/generate-swiss-round.body': {
    schema: StageSwissRoundBody,
    io: 'input',
  },
  'admin.stages/[stageId]/groups.body': {
    schema: StageGroupsBody,
    io: 'input',
  },
  'admin.stages/[stageId]/lobbies.create': {
    schema: StageLobbyCreateBody,
    io: 'input',
  },
  'admin.stages/[stageId]/snapshots.body': {
    schema: StageSnapshotBody,
    io: 'input',
  },
  'admin.stages/[stageId]/tiebreaker-override.body': {
    schema: TiebreakerOverrideBody,
    io: 'input',
  },
  'admin.stages/[stageId]/teams.body': { schema: StageTeamsBody, io: 'input' },
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
  // Run-of-show, régie et campagnes email (vague 2). Corps « historiques » :
  // looseBody (champs nommés), validés par le service.
  'admin.events.create': { schema: CreateRunDoc, io: 'input' },
  'admin.events/[runId].update': { schema: UpdateRunDoc, io: 'input' },
  'admin.events/[runId]/segments.create': {
    schema: CreateSegmentDoc,
    io: 'input',
  },
  'admin.events/[runId]/segments/[segId].update': {
    schema: UpdateSegmentDoc,
    io: 'input',
  },
  'admin.events/[runId]/segments/reorder.body': {
    schema: ReorderSegmentsDoc,
    io: 'input',
  },
  'admin.events/[runId]/segments/from-scrim.body': {
    schema: FromScrimDoc,
    io: 'input',
  },
  'admin.events/[runId]/segments/from-tournament.body': {
    schema: FromTournamentDoc,
    io: 'input',
  },
  'admin.events/[runId]/cues.create': { schema: CreateCueDoc, io: 'input' },
  'admin.events/[runId]/waves.create': { schema: CreateWaveDoc, io: 'input' },
  'admin.events/[runId]/waves/[waveId].update': {
    schema: UpdateWaveDoc,
    io: 'input',
  },
  'admin.events/[runId]/waves/reorder.body': {
    schema: ReorderWavesDoc,
    io: 'input',
  },
  'admin.events/[runId]/stations.create': {
    schema: CreateStationDoc,
    io: 'input',
  },
  'admin.events/[runId]/stations/[stationId].update': {
    schema: UpdateStationDoc,
    io: 'input',
  },
  'admin.broadcast/state.body': { schema: BroadcastStatePatchDoc, io: 'input' },
  'admin.broadcast.create': { schema: CampaignInputDoc, io: 'input' },
  'admin.broadcast/[campaignId].send': { schema: CampaignSendDoc, io: 'input' },
  'admin.broadcast/[campaignId].update': {
    schema: CampaignInputDoc,
    io: 'input',
  },
  'admin.broadcast/[campaignId]/schedule.body': {
    schema: CampaignScheduleDoc,
    io: 'input',
  },
  // Vague serveur 2 / C : map-pool, presets, lobbies, social, users, tcg.
  'admin.map-pool.create': { schema: MapPoolCreateDoc, io: 'input' },
  'admin.map-pool/[mapId].update': { schema: MapPoolPatchDoc, io: 'input' },
  'admin.map-pool/import-defaults.body': {
    schema: MapPoolImportDoc,
    io: 'input',
  },
  'admin.custom-game-presets.create': { schema: PresetCreateDoc, io: 'input' },
  'admin.custom-game-presets/[presetId].update': {
    schema: PresetPatchDoc,
    io: 'input',
  },
  'admin.lobbies/[lobbyId]/placements.body': {
    schema: PlacementsDoc,
    io: 'input',
  },
  'admin.instagram/secret.body': { schema: InstagramSecretDoc, io: 'input' },
  'admin.tiktok/credentials.body': {
    schema: TiktokCredentialsDoc,
    io: 'input',
  },
  'admin.users.create': { schema: CreateUserDoc, io: 'input' },
  'admin.users/manage.update': { schema: UsersManagePatchDoc, io: 'input' },
  'admin.users/manage.delete': { schema: UsersManageDeleteDoc, io: 'input' },
  'admin.users/[userId]/permissions.update': {
    schema: StaffPermissionsDoc,
    io: 'input',
  },
  'admin.users/[userId]/actions.body': { schema: PlayerActionDoc, io: 'input' },
  'admin.tcg/grant.body': { schema: TcgGrantDoc, io: 'input' },
  'admin.tcg/photos.update': { schema: TcgPhotoDecisionDoc, io: 'input' },
  'admin.tcg/fanart.update': { schema: TcgFanartDecisionDoc, io: 'input' },
  // Espaces, onboarding, clés d’API, webhooks (features/admin/tenants) :
  // corps « historiques » NOMMÉS, validés par le service (codes d’origine).
  'admin.active-tenant.body': { schema: ActiveTenantDoc, io: 'input' },
  'admin.tenants.create': { schema: TenantCreateDoc, io: 'input' },
  'admin.tenants/[id].update': { schema: TenantPatchDoc, io: 'input' },
  'admin.tenants/[id]/lifecycle.body': { schema: LifecycleDoc, io: 'input' },
  'admin.tenants/[id]/rotate-secrets.body': {
    schema: RotateSecretsDoc,
    io: 'input',
  },
  'admin.tenants/[id]/guilds.body': { schema: AttachGuildDoc, io: 'input' },
  'admin.tenants/[id]/plan-checkout.body': {
    schema: PlanCheckoutDoc,
    io: 'input',
  },
  'admin.tenants/[id]/nonprofit-rna.body': {
    schema: NonprofitRnaDoc,
    io: 'input',
  },
  'admin.tenants/[id]/staff.create': { schema: TenantStaffAddDoc, io: 'input' },
  'admin.tenants/[id]/invitations.create': {
    schema: InvitationCreateDoc,
    io: 'input',
  },
  'admin.tenants/[id]/discord-config/[guildId].update': {
    schema: DiscordConfigDoc,
    io: 'input',
  },
  'admin.tenant-requests/[id]/reject.body': {
    schema: TenantRequestRejectDoc,
    io: 'input',
  },
  'admin.api-tokens/[id].update': { schema: ApiTokenPatchDoc, io: 'input' },
  'admin.webhooks.create': { schema: WebhookCreateDoc, io: 'input' },
  'admin.webhooks/[id].update': { schema: WebhookPatchDoc, io: 'input' },
  // Fiche, litige, veto, drafts, casters, MVP, feuille de match, relance
  // check-in d'un match (features/admin/matches).
  'admin.matches/[matchId].update': { schema: MatchUpdateBody, io: 'input' },
  'admin.matches/[matchId]/dispute.create': {
    schema: DisputeOpenBody,
    io: 'input',
  },
  'admin.matches/[matchId]/dispute.update': {
    schema: DisputeResolveBody,
    io: 'input',
  },
  'admin.matches/[matchId]/veto.create': { schema: VetoStepBody, io: 'input' },
  'admin.matches/[matchId]/veto.update': {
    schema: VetoUnlockBody,
    io: 'input',
  },
  'admin.matches/[matchId]/drafts.create': {
    schema: DraftInitBody,
    io: 'input',
  },
  'admin.matches/[matchId]/drafts/[gameIndex]/side.update': {
    schema: DraftSideBody,
    io: 'input',
  },
  'admin.matches/[matchId]/drafts/[gameIndex]/commit.body': {
    schema: DraftCommitBody,
    io: 'input',
  },
  'admin.matches/[matchId]/cast-assignments.create': {
    schema: MatchCastAssignmentBody,
    io: 'input',
  },
  'admin.matches/[matchId]/cast-assignments/[assignmentId].update': {
    schema: MatchCastAssignmentPatchBody,
    io: 'input',
  },
  'admin.matches/[matchId]/mvp.body': { schema: MvpImportBody, io: 'input' },
  'admin.matches/[matchId]/mvp-public.body': {
    schema: MvpPublicLooseBody,
    io: 'input',
  },
  'admin.matches/[matchId]/lineup.body': {
    schema: MatchLineupBody,
    io: 'input',
  },
  'admin.matches/[matchId]/checkin-nudge.body': {
    schema: CheckinNudgeBody,
    io: 'input',
  },
};

export const ADMIN_FEATURE_QUERY_SCHEMAS: Record<string, ApiContractEntry> = {
  // Tournoi (features/admin/tournaments). Trois libellés d'erreur d'id
  // coexistaient ; chaque schéma partagé porte le sien :
  //   `checkin` (« Invalid tournament ID ») : checkin, checkin-nudge-all,
  //     checkin-settings, status-guards, apply-template, clone, stages, pool,
  //     podium-preview, conflicts, discord-test ;
  //   `stats` (« Invalid tournament id ») : stats, analytics, overlay-day,
  //     mvp-votes, mvp-public-votes, bracket, bulk-matches, auto-schedule ;
  //   `roster-unlock` (id validé par le service, code INVALID_TOURNAMENT_ID) :
  //     roster-unlock, availability, schedule-move, prize-pool.
  'admin.tournaments.query': { schema: TournamentListQuery, io: 'input' },
  'admin.tournament/[id].query': {
    schema: TournamentDetailQuery,
    io: 'input',
  },
  'admin.tournament/[id]/checkin.query': {
    schema: TournamentIdQuery,
    io: 'input',
  },
  'admin.tournament/[id]/stats.query': {
    schema: TournamentIdLowerQuery,
    io: 'input',
  },
  'admin.tournament/[id]/roster-unlock.query': {
    schema: CodedTournamentIdQuery,
    io: 'input',
  },
  'admin.tournament/[id]/dashboard.query': {
    schema: DashboardQuery,
    io: 'input',
  },
  'admin.tournament/[id]/teams.query': {
    schema: TournamentTeamsQuery,
    io: 'input',
  },
  'admin.tournament/[id]/teams/[teamId].query': {
    schema: TournamentTeamEntryQuery,
    io: 'input',
  },
  'admin.tournament/[id]/schedule-diagnostics.query': {
    schema: ScheduleDiagnosticsQuery,
    io: 'input',
  },
  'admin.tournament/[id]/history.query': {
    schema: TournamentHistoryQuery,
    io: 'input',
  },
  'admin.tournament/[id]/export-results.query': {
    schema: ExportResultsQuery,
    io: 'input',
  },
  'admin.tournament/[id]/discord-webhooks.query': {
    schema: DiscordWebhooksQuery,
    io: 'input',
  },
  'admin.tournament/[id]/matches.query': {
    schema: TournamentMatchesQuery,
    io: 'input',
  },
  // Phases (vague serveur 3) : `stages/[stageId]` couvre toutes les routes
  // qui ne lisent que stageId.
  'admin.stages/[stageId].query': { schema: StageIdQuery, io: 'input' },
  'admin.stages/[stageId].delete.query': {
    schema: StageDeleteQuery,
    io: 'input',
  },
  'admin.stages/[stageId]/history.query': {
    schema: StageHistoryQuery,
    io: 'input',
  },
  'admin.stages/[stageId]/standings.query': {
    schema: StageStandingsQuery,
    io: 'input',
  },
  'admin.stages/[stageId]/seeding-preview.query': {
    schema: SeedingPreviewQuery,
    io: 'input',
  },
  'admin.stages/[stageId]/rating-seeding-preview.query': {
    schema: RatingSeedingPreviewQuery,
    io: 'input',
  },
  'admin.stages/[stageId]/snapshots.query': {
    schema: SnapshotListQuery,
    io: 'input',
  },
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
  // Run-of-show et campagnes email (vague 2). `events/[runId]` couvre toutes
  // les sous-routes qui ne lisent que runId ; `broadcast/[campaignId]` couvre
  // envoi, duplication, planning et vague.
  'admin.events.query': { schema: RunListQuery, io: 'input' },
  'admin.events/[runId].query': { schema: RunIdQuery, io: 'input' },
  'admin.events/[runId]/cues.query': { schema: CueListQuery, io: 'input' },
  'admin.events/[runId]/cues/[cueId].query': {
    schema: CueIdQuery,
    io: 'input',
  },
  'admin.events/[runId]/segments/[segId].query': {
    schema: SegmentIdQuery,
    io: 'input',
  },
  'admin.events/[runId]/waves/[waveId].query': {
    schema: WaveIdQuery,
    io: 'input',
  },
  'admin.events/[runId]/stations/[stationId].query': {
    schema: StationIdQuery,
    io: 'input',
  },
  'admin.broadcast.query': { schema: CampaignListQuery, io: 'input' },
  'admin.broadcast/[campaignId].query': {
    schema: CampaignIdQuery,
    io: 'input',
  },
  'admin.broadcast/[campaignId]/preview.query': {
    schema: CampaignPreviewQuery,
    io: 'input',
  },
  // Vague serveur 2 / C : map-pool, presets, lobbies, users, tcg.
  'admin.map-pool.query': { schema: MapPoolListQuery, io: 'input' },
  'admin.map-pool/[mapId].query': { schema: MapPoolIdQuery, io: 'input' },
  'admin.custom-game-presets.query': { schema: PresetListQuery, io: 'input' },
  'admin.custom-game-presets/[presetId].query': {
    schema: PresetIdQuery,
    io: 'input',
  },
  // suppression d'un lobby et saisie de ses placements partagent le schéma.
  'admin.lobbies/[lobbyId].query': { schema: LobbyIdQuery, io: 'input' },
  'admin.users/manage.query': { schema: UsersManageListQuery, io: 'input' },
  // permissions et actions d'un compte partagent le même schéma.
  'admin.users/[userId].query': { schema: UserIdPathQuery, io: 'input' },
  'admin.tcg/catalogue.query': { schema: TcgCatalogueQuery, io: 'input' },
  'admin.tcg/engagement.query': { schema: TcgEngagementQuery, io: 'input' },
  'admin.tcg/players.query': { schema: TcgPlayersQuery, io: 'input' },
  'admin.tcg/fanart.query': { schema: TcgFanartListQuery, io: 'input' },
  // Espaces, onboarding, clés d’API, webhooks (features/admin/tenants).
  // Un seul schéma pour toutes les routes à `[id]` seul (espace, demande,
  // clé, webhook) ; bot-invite partage celui des routes `[id]/[guildId]`.
  'admin.tenants/[id].query': { schema: TenantsIdQuery, io: 'input' },
  'admin.tenants/[id]/discord-config/[guildId].query': {
    schema: TenantGuildQuery,
    io: 'input',
  },
  'admin.tenants/[id]/api-tokens.query': {
    schema: TenantApiTokensQuery,
    io: 'input',
  },
  'admin.tenants/[id]/staff/[staffId].query': {
    schema: TenantStaffIdQuery,
    io: 'input',
  },
  'admin.tenants/[id]/invitations/[invitationId].query': {
    schema: TenantInvitationIdQuery,
    io: 'input',
  },
  'admin.tenants/usage.query': { schema: TenantUsageQuery, io: 'input' },
  'admin.tenant-requests.query': {
    schema: TenantRequestListQuery,
    io: 'input',
  },
  // Matchs (features/admin/matches). `[matchId]` seul : un schéma par
  // message d'erreur historique (« Invalid matchId » / « matchId invalide »),
  // partagé par toutes les routes qui l'emploient.
  'admin.matches/[matchId].query': { schema: MatchByIdQuery, io: 'input' },
  'admin.matches/[matchId]/sub.query': { schema: MatchIdQuery, io: 'input' },
  'admin.matches/[matchId]/sub-fr.query': {
    schema: MatchIdFrQuery,
    io: 'input',
  },
  'admin.matches/[matchId]/lineup.query': {
    schema: MatchLineupQuery,
    io: 'input',
  },
  'admin.matches/[matchId]/dispute.delete.query': {
    schema: MatchDisputeQuery,
    io: 'input',
  },
  'admin.matches/[matchId]/cast-assignments/[assignmentId].query': {
    schema: MatchCastAssignmentIdQuery,
    io: 'input',
  },
  'admin.matches/[matchId]/drafts/[gameIndex].query': {
    schema: MatchDraftQuery,
    io: 'input',
  },
  'admin.matches/search.query': { schema: MatchSearchQuery, io: 'input' },
};
