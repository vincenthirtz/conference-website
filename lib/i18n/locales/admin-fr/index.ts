// lib/i18n/locales/admin-fr/index.ts
//
// Recomposition du dictionnaire francais complet.
//
// ATTENTION — reserve au garde-fou de parite (`../admin-parity.ts`) et aux tests.
// NE JAMAIS importer depuis du code applicatif : ca re-embarquerait les
// 180 namespaces dans le bundle et annulerait tout le decoupage.
// Un composant importe le SEUL namespace dont il a besoin.

import nsAdminQuickBracket from './adminQuickBracket';
import nsAdminLogout from './adminLogout';
import nsAdminForgotPassword from './adminForgotPassword';
import nsAdminResetPassword from './adminResetPassword';
import nsAdminProfile from './adminProfile';
import nsAdminDashboard from './adminDashboard';
import nsAdminAideTournoi from './adminAideTournoi';
import nsAdminRatings from './adminRatings';
import nsAdminRecycleBin from './adminRecycleBin';
import nsAdminLogs from './adminLogs';
import nsAdminEmailLogs from './adminEmailLogs';
import nsAdminDiscordLogs from './adminDiscordLogs';
import nsAdminTournamentOverview from './adminTournamentOverview';
import nsAdminTournamentEmbed from './adminTournamentEmbed';
import nsAdminTournamentDashboard from './adminTournamentDashboard';
import nsAdminTournamentEdit from './adminTournamentEdit';
import nsAdminRegistrationFields from './adminRegistrationFields';
import nsAdminTournamentMatches from './adminTournamentMatches';
import nsAdminTournamentPodium from './adminTournamentPodium';
import nsAdminTournamentStats from './adminTournamentStats';
import nsAdminTournamentAnalytics from './adminTournamentAnalytics';
import nsAdminTournamentHistory from './adminTournamentHistory';
import nsAdminTournamentBracket from './adminTournamentBracket';
import nsAdminTournamentBracketBuilder from './adminTournamentBracketBuilder';
import nsAdminTournamentStagesList from './adminTournamentStagesList';
import nsAdminTournamentDiscord from './adminTournamentDiscord';
import nsAdminTournamentVeto from './adminTournamentVeto';
import nsAdminTournamentMaps from './adminTournamentMaps';
import nsAdminMapPool from './adminMapPool';
import nsAdminFreePlayers from './adminFreePlayers';
import nsAdminCustomGamePresets from './adminCustomGamePresets';
import nsAdminTournamentMapDraw from './adminTournamentMapDraw';
import nsAdminTournamentCheckin from './adminTournamentCheckin';
import nsAdminTournamentCheckinLive from './adminTournamentCheckinLive';
import nsAdminTournamentBulkOps from './adminTournamentBulkOps';
import nsAdminTournamentNav from './adminTournamentNav';
import nsAdminTournamentPrizePool from './adminTournamentPrizePool';
import nsAdminTournamentsList from './adminTournamentsList';
import nsAdminTournamentsCreate from './adminTournamentsCreate';
import nsAdminUserPlayerView from './adminUserPlayerView';
import nsAdminUserCaptainView from './adminUserCaptainView';
import nsAdminUsersManage from './adminUsersManage';
import nsAdminUsersNew from './adminUsersNew';
import nsAdminTeamEdit from './adminTeamEdit';
import nsAdminTeamDetail from './adminTeamDetail';
import nsAdminTeamsList from './adminTeamsList';
import nsAdminTeamsMy from './adminTeamsMy';
import nsAdminTeamsNew from './adminTeamsNew';
import nsAdminStageNav from './adminStageNav';
import nsAdminStageDetail from './adminStageDetail';
import nsAdminStageGroups from './adminStageGroups';
import nsAdminStageHistory from './adminStageHistory';
import nsAdminStageSeeding from './adminStageSeeding';
import nsAdminStageSwiss from './adminStageSwiss';
import nsAdminStageTeams from './adminStageTeams';
import nsAdminStagesCreate from './adminStagesCreate';
import nsAdminLeagueDetail from './adminLeagueDetail';
import nsAdminLeaguesList from './adminLeaguesList';
import nsAdminDemandesList from './adminDemandesList';
import nsAdminDemandeDetail from './adminDemandeDetail';
import nsAdminAdherentsList from './adminAdherentsList';
import nsAdminAdherentsNew from './adminAdherentsNew';
import nsAdminAdherentDetail from './adminAdherentDetail';
import nsAdminTenantsList from './adminTenantsList';
import nsAdminTenantPlanCheckout from './adminTenantPlanCheckout';
import nsAdminTenantsNew from './adminTenantsNew';
import nsAdminBilling from './adminBilling';
import nsAdminTenantDetail from './adminTenantDetail';
import nsAdminTenantRequestsList from './adminTenantRequestsList';
import nsAdminPartnershipRequestsList from './adminPartnershipRequestsList';
import nsAdminPartnershipRequestDetail from './adminPartnershipRequestDetail';
import nsAdminOnboardingQueue from './adminOnboardingQueue';
import nsAdminPendingGuildLinks from './adminPendingGuildLinks';
import nsAdminNewsList from './adminNewsList';
import nsAdminNewsNew from './adminNewsNew';
import nsAdminNewsEdit from './adminNewsEdit';
import nsAdminAnnouncementsList from './adminAnnouncementsList';
import nsAdminAnnouncementsNew from './adminAnnouncementsNew';
import nsAdminAnnouncementEdit from './adminAnnouncementEdit';
import nsAdminPartnersList from './adminPartnersList';
import nsAdminPartnersNew from './adminPartnersNew';
import nsAdminPartnerEdit from './adminPartnerEdit';
import nsAdminCommentsList from './adminCommentsList';
import nsAdminPoleMembersList from './adminPoleMembersList';
import nsAdminPoleMembersNew from './adminPoleMembersNew';
import nsAdminPoleMemberEdit from './adminPoleMemberEdit';
import nsAdminCastMembersList from './adminCastMembersList';
import nsAdminCastMembersNew from './adminCastMembersNew';
import nsAdminCastMemberEdit from './adminCastMemberEdit';
import nsAdminTwitchChannelsList from './adminTwitchChannelsList';
import nsAdminTwitchChannelsNew from './adminTwitchChannelsNew';
import nsAdminTwitchChannelEdit from './adminTwitchChannelEdit';
import nsAdminScrimsList from './adminScrimsList';
import nsAdminScrimsCreate from './adminScrimsCreate';
import nsAdminScrimDetail from './adminScrimDetail';
import nsAdminDisputes from './adminDisputes';
import nsAdminBroadcastLive from './adminBroadcastLive';
import nsAdminTwitchPredictions from './adminTwitchPredictions';
import nsAdminTwitchCommands from './adminTwitchCommands';
import nsAdminEventsList from './adminEventsList';
import nsAdminNotifications from './adminNotifications';
import nsAdminSupport from './adminSupport';
import nsAdminModerationBlacklist from './adminModerationBlacklist';
import nsAdminModerationEntityBlacklist from './adminModerationEntityBlacklist';
import nsAdminMatchDraft from './adminMatchDraft';
import nsAdminMatchDetail from './adminMatchDetail';
import nsAdminMatchLineups from './adminMatchLineups';
import nsAdminMatchEdit from './adminMatchEdit';
import nsAdminEventDirector from './adminEventDirector';
import nsAdminCampaigns from './adminCampaigns';
import nsAdminSiteSettings from './adminSiteSettings';
import nsAdminSiteSettingsDiscord from './adminSiteSettingsDiscord';
import nsAdminSiteSettingsTeamRoles from './adminSiteSettingsTeamRoles';
import nsAdminStatsMaps from './adminStatsMaps';
import nsAdminStatsTeams from './adminStatsTeams';
import nsAdminTournamentTemplates from './adminTournamentTemplates';
import nsAdminTenantDiscordConfig from './adminTenantDiscordConfig';
import nsAdminDiscordTeamChannels from './adminDiscordTeamChannels';
import nsAdminTournamentSimulator from './adminTournamentSimulator';
import nsAdminAdvancementRulesEditor from './adminAdvancementRulesEditor';
import nsAdminAutoSaveIndicator from './adminAutoSaveIndicator';
import nsAdminBotSecretsRevealModal from './adminBotSecretsRevealModal';
import nsAdminBreadcrumb from './adminBreadcrumb';
import nsAdminCastMemberStaffPicker from './adminCastMemberStaffPicker';
import nsAdminConfirmDialog from './adminConfirmDialog';
import nsAdminDeleteConfirmModal from './adminDeleteConfirmModal';
import nsAdminAlertBanner from './adminAlertBanner';
import nsAdminLoadingSpinner from './adminLoadingSpinner';
import nsAdminDraftBanner from './adminDraftBanner';
import nsAdminLogoUpload from './adminLogoUpload';
import nsAdminMatchCastAssignments from './adminMatchCastAssignments';
import nsAdminMatchHistoryDrawer from './adminMatchHistoryDrawer';
import nsAdminMatchReadinessChecklist from './adminMatchReadinessChecklist';
import nsAdminMatchTimeline from './adminMatchTimeline';
import nsAdminModal from './adminModal';
import nsAdminTenantSwitcher from './adminTenantSwitcher';
import nsAdminBracketTreeView from './adminBracketTreeView';
import nsAdminBracketMatchCard from './adminBracketMatchCard';
import nsAdminBracketMatchListView from './adminBracketMatchListView';
import nsAdminBracketSeedSlot from './adminBracketSeedSlot';
import nsAdminDashboardConfirmAdvanceModal from './adminDashboardConfirmAdvanceModal';
import nsAdminDashboardDiscordHealthGrid from './adminDashboardDiscordHealthGrid';
import nsAdminDashboardDisputeResolveModal from './adminDashboardDisputeResolveModal';
import nsAdminDashboardScoreEntryModal from './adminDashboardScoreEntryModal';
import nsAdminDashboardSparkline from './adminDashboardSparkline';
import nsAdminDashboardStageProgressBar from './adminDashboardStageProgressBar';
import nsAdminDashboardSupportTicketsDonut from './adminDashboardSupportTicketsDonut';
import nsAdminDashboardUpcomingMatchRow from './adminDashboardUpcomingMatchRow';
import nsAdminDirectorAddSegmentModal from './adminDirectorAddSegmentModal';
import nsAdminDirectorCasterStatusPanel from './adminDirectorCasterStatusPanel';
import nsAdminDirectorCueComposer from './adminDirectorCueComposer';
import nsAdminDirectorCueFeed from './adminDirectorCueFeed';
import nsAdminDirectorMatchPicker from './adminDirectorMatchPicker';
import nsAdminDirectorRunStatusHeader from './adminDirectorRunStatusHeader';
import nsAdminDirectorSegmentCard from './adminDirectorSegmentCard';
import nsAdminDirectorSegmentEditor from './adminDirectorSegmentEditor';
import nsAdminDirectorStationBoard from './adminDirectorStationBoard';
import nsAdminDirectorTimelineBuilder from './adminDirectorTimelineBuilder';
import nsAdminDirectorWaveBoard from './adminDirectorWaveBoard';
import nsAdminSimulatorEliminationView from './adminSimulatorEliminationView';
import nsAdminSimulatorSimMatchCard from './adminSimulatorSimMatchCard';
import nsAdminTeamsAddMemberModal from './adminTeamsAddMemberModal';
import nsAdminTeamsEditMemberModal from './adminTeamsEditMemberModal';
import nsAdminTeamsImportBattleTagsModal from './adminTeamsImportBattleTagsModal';
import nsAdminTeamsMemberRow from './adminTeamsMemberRow';
import nsAdminTeamsMembersSection from './adminTeamsMembersSection';
import nsAdminFfa from './adminFfa';
import nsAdminWebhooks from './adminWebhooks';
import nsAdminApiTokens from './adminApiTokens';
import nsAdminApiTokenReveal from './adminApiTokenReveal';
import nsAdminStats from './adminStats';
import nsAdminJournals from './adminJournals';
import nsAdminModeration from './adminModeration';
import nsAdminPartnersHub from './adminPartnersHub';
import nsAdminCommunicationsHub from './adminCommunicationsHub';
import nsAdminAssociationHub from './adminAssociationHub';
import nsAdminOnboarding from './adminOnboarding';
import nsAdminScrimPlanningsList from './adminScrimPlanningsList';
import nsAdminScrimPlanningsCreate from './adminScrimPlanningsCreate';
import nsAdminScrimPlanningsDetail from './adminScrimPlanningsDetail';
import nsDeveloperHub from './developerHub';
import nsAdminTaskBoard from './adminTaskBoard';
import nsAdminTeamMessages from './adminTeamMessages';
import nsAdminCasterScenes from './adminCasterScenes';

export const frDict = {
  adminQuickBracket: nsAdminQuickBracket.fr,
  adminLogout: nsAdminLogout.fr,
  adminForgotPassword: nsAdminForgotPassword.fr,
  adminResetPassword: nsAdminResetPassword.fr,
  adminProfile: nsAdminProfile.fr,
  adminDashboard: nsAdminDashboard.fr,
  adminAideTournoi: nsAdminAideTournoi.fr,
  adminRatings: nsAdminRatings.fr,
  adminRecycleBin: nsAdminRecycleBin.fr,
  adminLogs: nsAdminLogs.fr,
  adminEmailLogs: nsAdminEmailLogs.fr,
  adminDiscordLogs: nsAdminDiscordLogs.fr,
  adminTournamentOverview: nsAdminTournamentOverview.fr,
  adminTournamentEmbed: nsAdminTournamentEmbed.fr,
  adminTournamentDashboard: nsAdminTournamentDashboard.fr,
  adminTournamentEdit: nsAdminTournamentEdit.fr,
  adminRegistrationFields: nsAdminRegistrationFields.fr,
  adminTournamentMatches: nsAdminTournamentMatches.fr,
  adminTournamentPodium: nsAdminTournamentPodium.fr,
  adminTournamentStats: nsAdminTournamentStats.fr,
  adminTournamentAnalytics: nsAdminTournamentAnalytics.fr,
  adminTournamentHistory: nsAdminTournamentHistory.fr,
  adminTournamentBracket: nsAdminTournamentBracket.fr,
  adminTournamentBracketBuilder: nsAdminTournamentBracketBuilder.fr,
  adminTournamentStagesList: nsAdminTournamentStagesList.fr,
  adminTournamentDiscord: nsAdminTournamentDiscord.fr,
  adminTournamentVeto: nsAdminTournamentVeto.fr,
  adminTournamentMaps: nsAdminTournamentMaps.fr,
  adminMapPool: nsAdminMapPool.fr,
  adminFreePlayers: nsAdminFreePlayers.fr,
  adminCustomGamePresets: nsAdminCustomGamePresets.fr,
  adminTournamentMapDraw: nsAdminTournamentMapDraw.fr,
  adminTournamentCheckin: nsAdminTournamentCheckin.fr,
  adminTournamentCheckinLive: nsAdminTournamentCheckinLive.fr,
  adminTournamentBulkOps: nsAdminTournamentBulkOps.fr,
  adminTournamentNav: nsAdminTournamentNav.fr,
  adminTournamentPrizePool: nsAdminTournamentPrizePool.fr,
  adminTournamentsList: nsAdminTournamentsList.fr,
  adminTournamentsCreate: nsAdminTournamentsCreate.fr,
  adminUserPlayerView: nsAdminUserPlayerView.fr,
  adminUserCaptainView: nsAdminUserCaptainView.fr,
  adminUsersManage: nsAdminUsersManage.fr,
  adminUsersNew: nsAdminUsersNew.fr,
  adminTeamEdit: nsAdminTeamEdit.fr,
  adminTeamDetail: nsAdminTeamDetail.fr,
  adminTeamsList: nsAdminTeamsList.fr,
  adminTeamsMy: nsAdminTeamsMy.fr,
  adminTeamsNew: nsAdminTeamsNew.fr,
  adminStageNav: nsAdminStageNav.fr,
  adminStageDetail: nsAdminStageDetail.fr,
  adminStageGroups: nsAdminStageGroups.fr,
  adminStageHistory: nsAdminStageHistory.fr,
  adminStageSeeding: nsAdminStageSeeding.fr,
  adminStageSwiss: nsAdminStageSwiss.fr,
  adminStageTeams: nsAdminStageTeams.fr,
  adminStagesCreate: nsAdminStagesCreate.fr,
  adminLeagueDetail: nsAdminLeagueDetail.fr,
  adminLeaguesList: nsAdminLeaguesList.fr,
  adminDemandesList: nsAdminDemandesList.fr,
  adminDemandeDetail: nsAdminDemandeDetail.fr,
  adminAdherentsList: nsAdminAdherentsList.fr,
  adminAdherentsNew: nsAdminAdherentsNew.fr,
  adminAdherentDetail: nsAdminAdherentDetail.fr,
  adminTenantsList: nsAdminTenantsList.fr,
  adminTenantPlanCheckout: nsAdminTenantPlanCheckout.fr,
  adminTenantsNew: nsAdminTenantsNew.fr,
  adminBilling: nsAdminBilling.fr,
  adminTenantDetail: nsAdminTenantDetail.fr,
  adminTenantRequestsList: nsAdminTenantRequestsList.fr,
  adminPartnershipRequestsList: nsAdminPartnershipRequestsList.fr,
  adminPartnershipRequestDetail: nsAdminPartnershipRequestDetail.fr,
  adminOnboardingQueue: nsAdminOnboardingQueue.fr,
  adminPendingGuildLinks: nsAdminPendingGuildLinks.fr,
  adminNewsList: nsAdminNewsList.fr,
  adminNewsNew: nsAdminNewsNew.fr,
  adminNewsEdit: nsAdminNewsEdit.fr,
  adminAnnouncementsList: nsAdminAnnouncementsList.fr,
  adminAnnouncementsNew: nsAdminAnnouncementsNew.fr,
  adminAnnouncementEdit: nsAdminAnnouncementEdit.fr,
  adminPartnersList: nsAdminPartnersList.fr,
  adminPartnersNew: nsAdminPartnersNew.fr,
  adminPartnerEdit: nsAdminPartnerEdit.fr,
  adminCommentsList: nsAdminCommentsList.fr,
  adminPoleMembersList: nsAdminPoleMembersList.fr,
  adminPoleMembersNew: nsAdminPoleMembersNew.fr,
  adminPoleMemberEdit: nsAdminPoleMemberEdit.fr,
  adminCastMembersList: nsAdminCastMembersList.fr,
  adminCastMembersNew: nsAdminCastMembersNew.fr,
  adminCastMemberEdit: nsAdminCastMemberEdit.fr,
  adminTwitchChannelsList: nsAdminTwitchChannelsList.fr,
  adminTwitchChannelsNew: nsAdminTwitchChannelsNew.fr,
  adminTwitchChannelEdit: nsAdminTwitchChannelEdit.fr,
  adminScrimsList: nsAdminScrimsList.fr,
  adminScrimsCreate: nsAdminScrimsCreate.fr,
  adminScrimDetail: nsAdminScrimDetail.fr,
  adminDisputes: nsAdminDisputes.fr,
  adminBroadcastLive: nsAdminBroadcastLive.fr,
  adminTwitchPredictions: nsAdminTwitchPredictions.fr,
  adminTwitchCommands: nsAdminTwitchCommands.fr,
  adminEventsList: nsAdminEventsList.fr,
  adminNotifications: nsAdminNotifications.fr,
  adminSupport: nsAdminSupport.fr,
  adminModerationBlacklist: nsAdminModerationBlacklist.fr,
  adminModerationEntityBlacklist: nsAdminModerationEntityBlacklist.fr,
  adminMatchDraft: nsAdminMatchDraft.fr,
  adminMatchDetail: nsAdminMatchDetail.fr,
  adminMatchLineups: nsAdminMatchLineups.fr,
  adminMatchEdit: nsAdminMatchEdit.fr,
  adminEventDirector: nsAdminEventDirector.fr,
  adminCampaigns: nsAdminCampaigns.fr,
  adminSiteSettings: nsAdminSiteSettings.fr,
  adminSiteSettingsDiscord: nsAdminSiteSettingsDiscord.fr,
  adminSiteSettingsTeamRoles: nsAdminSiteSettingsTeamRoles.fr,
  adminStatsMaps: nsAdminStatsMaps.fr,
  adminStatsTeams: nsAdminStatsTeams.fr,
  adminTournamentTemplates: nsAdminTournamentTemplates.fr,
  adminTenantDiscordConfig: nsAdminTenantDiscordConfig.fr,
  adminDiscordTeamChannels: nsAdminDiscordTeamChannels.fr,
  adminTournamentSimulator: nsAdminTournamentSimulator.fr,
  adminAdvancementRulesEditor: nsAdminAdvancementRulesEditor.fr,
  adminAutoSaveIndicator: nsAdminAutoSaveIndicator.fr,
  adminBotSecretsRevealModal: nsAdminBotSecretsRevealModal.fr,
  adminBreadcrumb: nsAdminBreadcrumb.fr,
  adminCastMemberStaffPicker: nsAdminCastMemberStaffPicker.fr,
  adminConfirmDialog: nsAdminConfirmDialog.fr,
  adminDeleteConfirmModal: nsAdminDeleteConfirmModal.fr,
  adminAlertBanner: nsAdminAlertBanner.fr,
  adminLoadingSpinner: nsAdminLoadingSpinner.fr,
  adminDraftBanner: nsAdminDraftBanner.fr,
  adminLogoUpload: nsAdminLogoUpload.fr,
  adminMatchCastAssignments: nsAdminMatchCastAssignments.fr,
  adminMatchHistoryDrawer: nsAdminMatchHistoryDrawer.fr,
  adminMatchReadinessChecklist: nsAdminMatchReadinessChecklist.fr,
  adminMatchTimeline: nsAdminMatchTimeline.fr,
  adminModal: nsAdminModal.fr,
  adminTenantSwitcher: nsAdminTenantSwitcher.fr,
  adminBracketTreeView: nsAdminBracketTreeView.fr,
  adminBracketMatchCard: nsAdminBracketMatchCard.fr,
  adminBracketMatchListView: nsAdminBracketMatchListView.fr,
  adminBracketSeedSlot: nsAdminBracketSeedSlot.fr,
  adminDashboardConfirmAdvanceModal: nsAdminDashboardConfirmAdvanceModal.fr,
  adminDashboardDiscordHealthGrid: nsAdminDashboardDiscordHealthGrid.fr,
  adminDashboardDisputeResolveModal: nsAdminDashboardDisputeResolveModal.fr,
  adminDashboardScoreEntryModal: nsAdminDashboardScoreEntryModal.fr,
  adminDashboardSparkline: nsAdminDashboardSparkline.fr,
  adminDashboardStageProgressBar: nsAdminDashboardStageProgressBar.fr,
  adminDashboardSupportTicketsDonut: nsAdminDashboardSupportTicketsDonut.fr,
  adminDashboardUpcomingMatchRow: nsAdminDashboardUpcomingMatchRow.fr,
  adminDirectorAddSegmentModal: nsAdminDirectorAddSegmentModal.fr,
  adminDirectorCasterStatusPanel: nsAdminDirectorCasterStatusPanel.fr,
  adminDirectorCueComposer: nsAdminDirectorCueComposer.fr,
  adminDirectorCueFeed: nsAdminDirectorCueFeed.fr,
  adminDirectorMatchPicker: nsAdminDirectorMatchPicker.fr,
  adminDirectorRunStatusHeader: nsAdminDirectorRunStatusHeader.fr,
  adminDirectorSegmentCard: nsAdminDirectorSegmentCard.fr,
  adminDirectorSegmentEditor: nsAdminDirectorSegmentEditor.fr,
  adminDirectorStationBoard: nsAdminDirectorStationBoard.fr,
  adminDirectorTimelineBuilder: nsAdminDirectorTimelineBuilder.fr,
  adminDirectorWaveBoard: nsAdminDirectorWaveBoard.fr,
  adminSimulatorEliminationView: nsAdminSimulatorEliminationView.fr,
  adminSimulatorSimMatchCard: nsAdminSimulatorSimMatchCard.fr,
  adminTeamsAddMemberModal: nsAdminTeamsAddMemberModal.fr,
  adminTeamsEditMemberModal: nsAdminTeamsEditMemberModal.fr,
  adminTeamsImportBattleTagsModal: nsAdminTeamsImportBattleTagsModal.fr,
  adminTeamsMemberRow: nsAdminTeamsMemberRow.fr,
  adminTeamsMembersSection: nsAdminTeamsMembersSection.fr,
  adminFfa: nsAdminFfa.fr,
  adminWebhooks: nsAdminWebhooks.fr,
  adminApiTokens: nsAdminApiTokens.fr,
  adminApiTokenReveal: nsAdminApiTokenReveal.fr,
  adminStats: nsAdminStats.fr,
  adminJournals: nsAdminJournals.fr,
  adminModeration: nsAdminModeration.fr,
  adminPartnersHub: nsAdminPartnersHub.fr,
  adminCommunicationsHub: nsAdminCommunicationsHub.fr,
  adminAssociationHub: nsAdminAssociationHub.fr,
  adminOnboarding: nsAdminOnboarding.fr,
  adminScrimPlanningsList: nsAdminScrimPlanningsList.fr,
  adminScrimPlanningsCreate: nsAdminScrimPlanningsCreate.fr,
  adminScrimPlanningsDetail: nsAdminScrimPlanningsDetail.fr,
  developerHub: nsDeveloperHub.fr,
  adminTaskBoard: nsAdminTaskBoard.fr,
  adminTeamMessages: nsAdminTeamMessages.fr,
  adminCasterScenes: nsAdminCasterScenes.fr,
};
