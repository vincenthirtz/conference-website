// lib/apiContracts/bot/index.ts
//
// Schémas zod des corps de requête des routes bot, référencés par la spec
// OpenAPI sous le nom `bot.<route>` (chemin sous pages/api/bot/v1, sans
// extension). Cf. lib/apiContracts/index.ts.

import type { ApiContractEntry } from '../index';
import { ackBodySchema as s0_cast_assignmentId_ack } from './cast/[assignmentId]/ack';
import { handledBodySchema as s1_events_handled } from './events/handled';
import { syncBodySchema as s2_free_players_sync } from './free-players/sync';
import { profileBodySchema as s2_free_players_profile } from './free-players/profile';
import { invitationBodySchema as s3_invitations_demandeId } from './invitations/[demandeId]';
import { lockBodySchema as s4_locks_name } from './locks/[name]';
import { checkinBodySchema as s5_matches_matchId_checkin } from './matches/[matchId]/checkin';
import { mvpBodySchema as s5b_matches_matchId_mvp } from './matches/[matchId]/mvp';
import { mvpPublicBodySchema as s5c_matches_matchId_mvp_public } from './matches/[matchId]/mvp-public';
import { draftsBodySchema as s6_matches_matchId_drafts } from './matches/[matchId]/drafts';
import { evidencePostSchema as s7_matches_matchId_evidence } from './matches/[matchId]/evidence';
import { forfeitBodySchema as s8_matches_matchId_forfeit } from './matches/[matchId]/forfeit';
import { reportBodySchema as s9_matches_matchId_report } from './matches/[matchId]/report';
import { resetBodySchema as s10_matches_matchId_reset } from './matches/[matchId]/reset';
import { blacklistAlertBodySchema as s11_moderation_blacklist_alert } from './moderation/blacklist-alert';
import { snoozeBodySchema as s12_players_by_discord_discordUserId_actions_snooze } from './players/by-discord/[discordUserId]/actions/snooze';
import { profileBodySchema as s13_players_by_discord_discordUserId_profile } from './players/by-discord/[discordUserId]/profile';
import { registerUserBodySchema as s14_register_user } from './register-user';
import { presenceBodySchema as s15_role_sync_presence } from './role-sync/presence';
import { scrimPatchBodySchema as s16_scrims_scrimId_index } from './scrims/[scrimId]/index';
import { matchesBodySchema as s17_scrims_scrimId_matches } from './scrims/[scrimId]/matches';
import { scrimMatchPatchBodySchema as s18_scrims_scrimId_matches_matchId } from './scrims/[scrimId]/matches/[matchId]';
import { scrimCreateBodySchema as s19_scrims_index } from './scrims/index';
import { autoByesBodySchema as s20_stages_stageId_auto_byes } from './stages/[stageId]/auto-byes';
import { finalizeBodySchema as s21_stages_stageId_finalize } from './stages/[stageId]/finalize';
import { nextRoundBodySchema as s22_stages_stageId_next_round } from './stages/[stageId]/next-round';
import { discordWritebackBodySchema as s23_teams_teamId_discord } from './teams/[teamId]/discord';
import { createInvitationBodySchema as s24_teams_teamId_invitations } from './teams/[teamId]/invitations';
import { kickMemberBodySchema as s25_teams_teamId_members } from './teams/[teamId]/members';
import { transferCaptainBodySchema as s26_teams_teamId_transfer_captain } from './teams/[teamId]/transfer-captain';
import { createTeamBodySchema as s27_teams_index } from './teams/index';
import { leaveBodySchema as s28_teams_leave } from './teams/leave';
import { closeLogBodySchema as s29_tickets_close_log } from './tickets/close-log';
import { cloneBodySchema as s30_tournaments_tournamentId_clone } from './tournaments/[tournamentId]/clone';
import { createStageBodySchema as s31_tournaments_tournamentId_stages } from './tournaments/[tournamentId]/stages';
import { statusBodySchema as s32_tournaments_tournamentId_status } from './tournaments/[tournamentId]/status';
import { registerBodySchema as s33_tournaments_tournamentId_teams } from './tournaments/[tournamentId]/teams';
import { createBodySchema as s34_tournaments_index } from './tournaments/index';
import { botCreateTaskBodySchema as s_tasks_index } from './tasks/index';
import { ackQuerySchema as q0_cast_assignmentId_ack } from './cast/[assignmentId]/ack.query';
import { ackQuerySchema as q1_events_id_ack } from './events/[id]/ack.query';
import { invitationQuerySchema as q2_invitations_demandeId } from './invitations/[demandeId].query';
import { lockQuerySchema as q3_locks_name } from './locks/[name].query';
import { metaQuerySchema as q4_matches_matchId } from './matches/[matchId].query';
import { castQuerySchema as q5_matches_matchId_cast } from './matches/[matchId]/cast.query';
import { checkinQuerySchema as q6_matches_matchId_checkin } from './matches/[matchId]/checkin.query';
import { mvpQuerySchema as q6b_matches_matchId_mvp } from './matches/[matchId]/mvp.query';
import { mvpPublicQuerySchema as q6c_matches_matchId_mvp_public } from './matches/[matchId]/mvp-public.query';
import { discordQuerySchema as q7_matches_matchId_discord } from './matches/[matchId]/discord.query';
import { draftsQuerySchema as q8_matches_matchId_drafts } from './matches/[matchId]/drafts.query';
import { evidenceQuerySchema as q9_matches_matchId_evidence } from './matches/[matchId]/evidence.query';
import { forfeitQuerySchema as q10_matches_matchId_forfeit } from './matches/[matchId]/forfeit.query';
import { presetQuerySchema as q11_matches_matchId_preset } from './matches/[matchId]/preset.query';
import { reportQuerySchema as q12_matches_matchId_report } from './matches/[matchId]/report.query';
import { resetQuerySchema as q13_matches_matchId_reset } from './matches/[matchId]/reset.query';
import { resolveDisputeQuerySchema as q14_matches_matchId_resolve_dispute } from './matches/[matchId]/resolve-dispute.query';
import { vetoQuerySchema as q15_matches_matchId_veto } from './matches/[matchId]/veto.query';
import { snoozeQuerySchema as q16_players_by_discord_discordUserId_actions_snooze } from './players/by-discord/[discordUserId]/actions/snooze.query';
import { profileQuerySchema as q17_players_by_discord_discordUserId_profile } from './players/by-discord/[discordUserId]/profile.query';
import { scrimQuerySchema as q18_scrims_scrimId_index } from './scrims/[scrimId]/index.query';
import { matchesQuerySchema as q19_scrims_scrimId_matches } from './scrims/[scrimId]/matches.query';
import { scrimMatchQuerySchema as q20_scrims_scrimId_matches_matchId } from './scrims/[scrimId]/matches/[matchId].query';
import { autoByesQuerySchema as q21_stages_stageId_auto_byes } from './stages/[stageId]/auto-byes.query';
import { finalizeQuerySchema as q22_stages_stageId_finalize } from './stages/[stageId]/finalize.query';
import { nextRoundQuerySchema as q23_stages_stageId_next_round } from './stages/[stageId]/next-round.query';
import { boardSnapshotQuerySchema as q24_tasks_board_snapshot } from '../../../utils/taskBoardSchemas';
import { teamQuerySchema as q25_teams_teamId } from './teams/[teamId].query';
import { discordQuerySchema as q26_teams_teamId_discord } from './teams/[teamId]/discord.query';
import { invitationsQuerySchema as q27_teams_teamId_invitations } from './teams/[teamId]/invitations.query';
import { kickMemberQuerySchema as q28_teams_teamId_members } from './teams/[teamId]/members.query';
import { transferCaptainQuerySchema as q29_teams_teamId_transfer_captain } from './teams/[teamId]/transfer-captain.query';
import { listTeamsQuerySchema as q30_teams_index } from './teams/index.query';
import { cloneQuerySchema as q31_tournaments_tournamentId_clone } from './tournaments/[tournamentId]/clone.query';
import { matchesQuerySchema as q32_tournaments_tournamentId_matches } from './tournaments/[tournamentId]/matches.query';
import { createStageQuerySchema as q33_tournaments_tournamentId_stages } from './tournaments/[tournamentId]/stages.query';
import { statusQuerySchema as q34_tournaments_tournamentId_status } from './tournaments/[tournamentId]/status.query';
import { teamsQuerySchema as q35_tournaments_tournamentId_teams } from './tournaments/[tournamentId]/teams.query';

export const BOT_API_CONTRACT_SCHEMAS: Record<string, ApiContractEntry> = {
  'bot.cast/[assignmentId]/ack': {
    schema: s0_cast_assignmentId_ack,
    io: 'input',
  },
  'bot.events/handled': { schema: s1_events_handled, io: 'input' },
  'bot.free-players/sync': { schema: s2_free_players_sync, io: 'input' },
  'bot.free-players/profile': {
    schema: s2_free_players_profile,
    io: 'input',
  },
  'bot.invitations/[demandeId]': {
    schema: s3_invitations_demandeId,
    io: 'input',
  },
  'bot.locks/[name]': { schema: s4_locks_name, io: 'input' },
  'bot.matches/[matchId]/mvp': {
    schema: s5b_matches_matchId_mvp,
    io: 'input',
  },
  'bot.matches/[matchId]/mvp-public': {
    schema: s5c_matches_matchId_mvp_public,
    io: 'input',
  },
  'bot.matches/[matchId]/checkin': {
    schema: s5_matches_matchId_checkin,
    io: 'input',
  },
  'bot.matches/[matchId]/drafts': {
    schema: s6_matches_matchId_drafts,
    io: 'input',
  },
  'bot.matches/[matchId]/evidence': {
    schema: s7_matches_matchId_evidence,
    io: 'input',
  },
  'bot.matches/[matchId]/forfeit': {
    schema: s8_matches_matchId_forfeit,
    io: 'input',
  },
  'bot.matches/[matchId]/report': {
    schema: s9_matches_matchId_report,
    io: 'input',
  },
  'bot.matches/[matchId]/reset': {
    schema: s10_matches_matchId_reset,
    io: 'input',
  },
  'bot.moderation/blacklist-alert': {
    schema: s11_moderation_blacklist_alert,
    io: 'input',
  },
  'bot.players/by-discord/[discordUserId]/actions/snooze': {
    schema: s12_players_by_discord_discordUserId_actions_snooze,
    io: 'input',
  },
  'bot.players/by-discord/[discordUserId]/profile': {
    schema: s13_players_by_discord_discordUserId_profile,
    io: 'input',
  },
  'bot.register-user': { schema: s14_register_user, io: 'input' },
  'bot.role-sync/presence': { schema: s15_role_sync_presence, io: 'input' },
  'bot.scrims/[scrimId]/index': {
    schema: s16_scrims_scrimId_index,
    io: 'input',
  },
  'bot.scrims/[scrimId]/matches': {
    schema: s17_scrims_scrimId_matches,
    io: 'input',
  },
  'bot.scrims/[scrimId]/matches/[matchId]': {
    schema: s18_scrims_scrimId_matches_matchId,
    io: 'input',
  },
  'bot.scrims/index': { schema: s19_scrims_index, io: 'input' },
  'bot.stages/[stageId]/auto-byes': {
    schema: s20_stages_stageId_auto_byes,
    io: 'input',
  },
  'bot.stages/[stageId]/finalize': {
    schema: s21_stages_stageId_finalize,
    io: 'input',
  },
  'bot.stages/[stageId]/next-round': {
    schema: s22_stages_stageId_next_round,
    io: 'input',
  },
  'bot.teams/[teamId]/discord': {
    schema: s23_teams_teamId_discord,
    io: 'input',
  },
  'bot.teams/[teamId]/invitations': {
    schema: s24_teams_teamId_invitations,
    io: 'input',
  },
  'bot.teams/[teamId]/members': {
    schema: s25_teams_teamId_members,
    io: 'input',
  },
  'bot.teams/[teamId]/transfer-captain': {
    schema: s26_teams_teamId_transfer_captain,
    io: 'input',
  },
  'bot.teams/index': { schema: s27_teams_index, io: 'input' },
  'bot.teams/leave': { schema: s28_teams_leave, io: 'input' },
  'bot.tickets/close-log': { schema: s29_tickets_close_log, io: 'input' },
  'bot.tournaments/[tournamentId]/clone': {
    schema: s30_tournaments_tournamentId_clone,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/stages': {
    schema: s31_tournaments_tournamentId_stages,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/status': {
    schema: s32_tournaments_tournamentId_status,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/teams': {
    schema: s33_tournaments_tournamentId_teams,
    io: 'input',
  },
  'bot.tournaments/index': { schema: s34_tournaments_index, io: 'input' },
  'bot.tasks/index': { schema: s_tasks_index, io: 'input' },
  'bot.cast/[assignmentId]/ack.query': {
    schema: q0_cast_assignmentId_ack,
    io: 'input',
  },
  'bot.events/[id]/ack.query': { schema: q1_events_id_ack, io: 'input' },
  'bot.invitations/[demandeId].query': {
    schema: q2_invitations_demandeId,
    io: 'input',
  },
  'bot.locks/[name].query': { schema: q3_locks_name, io: 'input' },
  'bot.matches/[matchId].query': { schema: q4_matches_matchId, io: 'input' },
  'bot.matches/[matchId]/cast.query': {
    schema: q5_matches_matchId_cast,
    io: 'input',
  },
  'bot.matches/[matchId]/mvp.query': {
    schema: q6b_matches_matchId_mvp,
    io: 'input',
  },
  'bot.matches/[matchId]/mvp-public.query': {
    schema: q6c_matches_matchId_mvp_public,
    io: 'input',
  },
  'bot.matches/[matchId]/checkin.query': {
    schema: q6_matches_matchId_checkin,
    io: 'input',
  },
  'bot.matches/[matchId]/discord.query': {
    schema: q7_matches_matchId_discord,
    io: 'input',
  },
  'bot.matches/[matchId]/drafts.query': {
    schema: q8_matches_matchId_drafts,
    io: 'input',
  },
  'bot.matches/[matchId]/evidence.query': {
    schema: q9_matches_matchId_evidence,
    io: 'input',
  },
  'bot.matches/[matchId]/forfeit.query': {
    schema: q10_matches_matchId_forfeit,
    io: 'input',
  },
  'bot.matches/[matchId]/preset.query': {
    schema: q11_matches_matchId_preset,
    io: 'input',
  },
  'bot.matches/[matchId]/report.query': {
    schema: q12_matches_matchId_report,
    io: 'input',
  },
  'bot.matches/[matchId]/reset.query': {
    schema: q13_matches_matchId_reset,
    io: 'input',
  },
  'bot.matches/[matchId]/resolve-dispute.query': {
    schema: q14_matches_matchId_resolve_dispute,
    io: 'input',
  },
  'bot.matches/[matchId]/veto.query': {
    schema: q15_matches_matchId_veto,
    io: 'input',
  },
  'bot.players/by-discord/[discordUserId]/actions/snooze.query': {
    schema: q16_players_by_discord_discordUserId_actions_snooze,
    io: 'input',
  },
  'bot.players/by-discord/[discordUserId]/profile.query': {
    schema: q17_players_by_discord_discordUserId_profile,
    io: 'input',
  },
  'bot.scrims/[scrimId]/index.query': {
    schema: q18_scrims_scrimId_index,
    io: 'input',
  },
  'bot.scrims/[scrimId]/matches.query': {
    schema: q19_scrims_scrimId_matches,
    io: 'input',
  },
  'bot.scrims/[scrimId]/matches/[matchId].query': {
    schema: q20_scrims_scrimId_matches_matchId,
    io: 'input',
  },
  'bot.stages/[stageId]/auto-byes.query': {
    schema: q21_stages_stageId_auto_byes,
    io: 'input',
  },
  'bot.stages/[stageId]/finalize.query': {
    schema: q22_stages_stageId_finalize,
    io: 'input',
  },
  'bot.stages/[stageId]/next-round.query': {
    schema: q23_stages_stageId_next_round,
    io: 'input',
  },
  'bot.tasks/board-snapshot.query': {
    schema: q24_tasks_board_snapshot,
    io: 'input',
  },
  'bot.teams/[teamId].query': { schema: q25_teams_teamId, io: 'input' },
  'bot.teams/[teamId]/discord.query': {
    schema: q26_teams_teamId_discord,
    io: 'input',
  },
  'bot.teams/[teamId]/invitations.query': {
    schema: q27_teams_teamId_invitations,
    io: 'input',
  },
  'bot.teams/[teamId]/members.query': {
    schema: q28_teams_teamId_members,
    io: 'input',
  },
  'bot.teams/[teamId]/transfer-captain.query': {
    schema: q29_teams_teamId_transfer_captain,
    io: 'input',
  },
  'bot.teams/index.query': { schema: q30_teams_index, io: 'input' },
  'bot.tournaments/[tournamentId]/clone.query': {
    schema: q31_tournaments_tournamentId_clone,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/matches.query': {
    schema: q32_tournaments_tournamentId_matches,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/stages.query': {
    schema: q33_tournaments_tournamentId_stages,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/status.query': {
    schema: q34_tournaments_tournamentId_status,
    io: 'input',
  },
  'bot.tournaments/[tournamentId]/teams.query': {
    schema: q35_tournaments_tournamentId_teams,
    io: 'input',
  },
};
