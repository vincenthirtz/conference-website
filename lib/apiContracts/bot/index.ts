// lib/apiContracts/bot/index.ts
//
// Schémas zod des corps de requête des routes bot, référencés par la spec
// OpenAPI sous le nom `bot.<route>` (chemin sous pages/api/bot/v1, sans
// extension). Cf. lib/apiContracts/index.ts.

import type { ApiContractEntry } from '../index';
import { ackBodySchema as s0_cast_assignmentId_ack } from './cast/[assignmentId]/ack';
import { handledBodySchema as s1_events_handled } from './events/handled';
import { syncBodySchema as s2_free_players_sync } from './free-players/sync';
import { invitationBodySchema as s3_invitations_demandeId } from './invitations/[demandeId]';
import { lockBodySchema as s4_locks_name } from './locks/[name]';
import { checkinBodySchema as s5_matches_matchId_checkin } from './matches/[matchId]/checkin';
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

export const BOT_API_CONTRACT_SCHEMAS: Record<string, ApiContractEntry> = {
  'bot.cast/[assignmentId]/ack': {
    schema: s0_cast_assignmentId_ack,
    io: 'input',
  },
  'bot.events/handled': { schema: s1_events_handled, io: 'input' },
  'bot.free-players/sync': { schema: s2_free_players_sync, io: 'input' },
  'bot.invitations/[demandeId]': {
    schema: s3_invitations_demandeId,
    io: 'input',
  },
  'bot.locks/[name]': { schema: s4_locks_name, io: 'input' },
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
};
