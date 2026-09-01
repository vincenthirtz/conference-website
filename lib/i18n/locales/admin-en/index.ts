// lib/i18n/locales/admin-en/index.ts
//
// Recomposition du dictionnaire ANGLAIS de l'admin.
//
// Point d'entree charge paresseusement par `useAdminT` a la bascule FR->EN
// (cf. `../../lazyLocale.ts`). L'anglais reste UN SEUL chunk et UNE SEULE
// requete : seule l'ECRITURE est eclatee, un fichier par namespace, en miroir
// de `../admin-fr/`.

import enAdminQuickBracket from './adminQuickBracket';
import enAdminLogout from './adminLogout';
import enAdminForgotPassword from './adminForgotPassword';
import enAdminResetPassword from './adminResetPassword';
import enAdminProfile from './adminProfile';
import enAdminDashboard from './adminDashboard';
import enAdminAideTournoi from './adminAideTournoi';
import enAdminRatings from './adminRatings';
import enAdminRecycleBin from './adminRecycleBin';
import enAdminLogs from './adminLogs';
import enAdminEmailLogs from './adminEmailLogs';
import enAdminTournamentOverview from './adminTournamentOverview';
import enAdminTournamentEmbed from './adminTournamentEmbed';
import enAdminTournamentDashboard from './adminTournamentDashboard';
import enAdminTournamentEdit from './adminTournamentEdit';
import enAdminRegistrationFields from './adminRegistrationFields';
import enAdminTournamentMatches from './adminTournamentMatches';
import enAdminTournamentPodium from './adminTournamentPodium';
import enAdminTournamentStats from './adminTournamentStats';
import enAdminTournamentAnalytics from './adminTournamentAnalytics';
import enAdminTournamentHistory from './adminTournamentHistory';
import enAdminTournamentBracket from './adminTournamentBracket';
import enAdminTournamentBracketBuilder from './adminTournamentBracketBuilder';
import enAdminTournamentStagesList from './adminTournamentStagesList';
import enAdminTournamentDiscord from './adminTournamentDiscord';
import enAdminTournamentVeto from './adminTournamentVeto';
import enAdminTournamentMaps from './adminTournamentMaps';
import enAdminMapPool from './adminMapPool';
import enAdminCustomGamePresets from './adminCustomGamePresets';
import enAdminTournamentMapDraw from './adminTournamentMapDraw';
import enAdminTournamentCheckin from './adminTournamentCheckin';
import enAdminTournamentCheckinLive from './adminTournamentCheckinLive';
import enAdminTournamentBulkOps from './adminTournamentBulkOps';
import enAdminTournamentNav from './adminTournamentNav';
import enAdminTournamentPrizePool from './adminTournamentPrizePool';
import enAdminTournamentsList from './adminTournamentsList';
import enAdminTournamentsCreate from './adminTournamentsCreate';
import enAdminUserPlayerView from './adminUserPlayerView';
import enAdminUserCaptainView from './adminUserCaptainView';
import enAdminUsersManage from './adminUsersManage';
import enAdminUsersNew from './adminUsersNew';
import enAdminTeamEdit from './adminTeamEdit';
import enAdminTeamDetail from './adminTeamDetail';
import enAdminTeamsList from './adminTeamsList';
import enAdminTeamsMy from './adminTeamsMy';
import enAdminTeamsNew from './adminTeamsNew';
import enAdminStageNav from './adminStageNav';
import enAdminStageDetail from './adminStageDetail';
import enAdminStageGroups from './adminStageGroups';
import enAdminStageHistory from './adminStageHistory';
import enAdminStageSeeding from './adminStageSeeding';
import enAdminStageSwiss from './adminStageSwiss';
import enAdminStageTeams from './adminStageTeams';
import enAdminStagesCreate from './adminStagesCreate';
import enAdminLeagueDetail from './adminLeagueDetail';
import enAdminLeaguesList from './adminLeaguesList';
import enAdminDemandesList from './adminDemandesList';
import enAdminDemandeDetail from './adminDemandeDetail';
import enAdminAdherentsList from './adminAdherentsList';
import enAdminAdherentsNew from './adminAdherentsNew';
import enAdminAdherentDetail from './adminAdherentDetail';
import enAdminTenantsList from './adminTenantsList';
import enAdminTenantPlanCheckout from './adminTenantPlanCheckout';
import enAdminTenantsNew from './adminTenantsNew';
import enAdminBilling from './adminBilling';
import enAdminTenantDetail from './adminTenantDetail';
import enAdminTenantRequestsList from './adminTenantRequestsList';
import enAdminPartnershipRequestsList from './adminPartnershipRequestsList';
import enAdminPartnershipRequestDetail from './adminPartnershipRequestDetail';
import enAdminOnboardingQueue from './adminOnboardingQueue';
import enAdminPendingGuildLinks from './adminPendingGuildLinks';
import enAdminNewsList from './adminNewsList';
import enAdminNewsNew from './adminNewsNew';
import enAdminNewsEdit from './adminNewsEdit';
import enAdminAnnouncementsList from './adminAnnouncementsList';
import enAdminAnnouncementsNew from './adminAnnouncementsNew';
import enAdminAnnouncementEdit from './adminAnnouncementEdit';
import enAdminPartnersList from './adminPartnersList';
import enAdminPartnersNew from './adminPartnersNew';
import enAdminPartnerEdit from './adminPartnerEdit';
import enAdminCommentsList from './adminCommentsList';
import enAdminPoleMembersList from './adminPoleMembersList';
import enAdminPoleMembersNew from './adminPoleMembersNew';
import enAdminPoleMemberEdit from './adminPoleMemberEdit';
import enAdminCastMembersList from './adminCastMembersList';
import enAdminCastMembersNew from './adminCastMembersNew';
import enAdminCastMemberEdit from './adminCastMemberEdit';
import enAdminTwitchChannelsList from './adminTwitchChannelsList';
import enAdminTwitchChannelsNew from './adminTwitchChannelsNew';
import enAdminTwitchChannelEdit from './adminTwitchChannelEdit';
import enAdminScrimsList from './adminScrimsList';
import enAdminScrimsCreate from './adminScrimsCreate';
import enAdminScrimDetail from './adminScrimDetail';
import enAdminDisputes from './adminDisputes';
import enAdminBroadcastLive from './adminBroadcastLive';
import enAdminTwitchPredictions from './adminTwitchPredictions';
import enAdminTwitchCommands from './adminTwitchCommands';
import enAdminEventsList from './adminEventsList';
import enAdminNotifications from './adminNotifications';
import enAdminSupport from './adminSupport';
import enAdminModerationBlacklist from './adminModerationBlacklist';
import enAdminModerationEntityBlacklist from './adminModerationEntityBlacklist';
import enAdminMatchDraft from './adminMatchDraft';
import enAdminMatchDetail from './adminMatchDetail';
import enAdminMatchEdit from './adminMatchEdit';
import enAdminEventDirector from './adminEventDirector';
import enAdminCampaigns from './adminCampaigns';
import enAdminCommandPalette from './adminCommandPalette';
import enAdminDataTable from './adminDataTable';
import enAdminEntityHistory from './adminEntityHistory';
import enAdminSiteSettings from './adminSiteSettings';
import enAdminSiteSettingsDiscord from './adminSiteSettingsDiscord';
import enAdminSiteSettingsTeamRoles from './adminSiteSettingsTeamRoles';
import enAdminStatsMaps from './adminStatsMaps';
import enAdminStatsTeams from './adminStatsTeams';
import enAdminTournamentTemplates from './adminTournamentTemplates';
import enAdminTenantDiscordConfig from './adminTenantDiscordConfig';
import enAdminDiscordTeamChannels from './adminDiscordTeamChannels';
import enAdminTournamentSimulator from './adminTournamentSimulator';
import enAdminAdvancementRulesEditor from './adminAdvancementRulesEditor';
import enAdminAutoSaveIndicator from './adminAutoSaveIndicator';
import enAdminBotSecretsRevealModal from './adminBotSecretsRevealModal';
import enAdminBreadcrumb from './adminBreadcrumb';
import enAdminCastMemberStaffPicker from './adminCastMemberStaffPicker';
import enAdminConfirmDialog from './adminConfirmDialog';
import enAdminDeleteConfirmModal from './adminDeleteConfirmModal';
import enAdminAlertBanner from './adminAlertBanner';
import enAdminLoadingSpinner from './adminLoadingSpinner';
import enAdminDraftBanner from './adminDraftBanner';
import enAdminLogoUpload from './adminLogoUpload';
import enAdminMatchCastAssignments from './adminMatchCastAssignments';
import enAdminMatchHistoryDrawer from './adminMatchHistoryDrawer';
import enAdminMatchReadinessChecklist from './adminMatchReadinessChecklist';
import enAdminMatchTimeline from './adminMatchTimeline';
import enAdminModal from './adminModal';
import enAdminTenantSwitcher from './adminTenantSwitcher';
import enAdminBracketTreeView from './adminBracketTreeView';
import enAdminBracketMatchCard from './adminBracketMatchCard';
import enAdminBracketMatchListView from './adminBracketMatchListView';
import enAdminBracketSeedSlot from './adminBracketSeedSlot';
import enAdminDashboardConfirmAdvanceModal from './adminDashboardConfirmAdvanceModal';
import enAdminDashboardDiscordHealthGrid from './adminDashboardDiscordHealthGrid';
import enAdminDashboardDisputeResolveModal from './adminDashboardDisputeResolveModal';
import enAdminDashboardScoreEntryModal from './adminDashboardScoreEntryModal';
import enAdminDashboardSparkline from './adminDashboardSparkline';
import enAdminDashboardStageProgressBar from './adminDashboardStageProgressBar';
import enAdminDashboardSupportTicketsDonut from './adminDashboardSupportTicketsDonut';
import enAdminDashboardUpcomingMatchRow from './adminDashboardUpcomingMatchRow';
import enAdminDirectorAddSegmentModal from './adminDirectorAddSegmentModal';
import enAdminDirectorCasterStatusPanel from './adminDirectorCasterStatusPanel';
import enAdminDirectorCueComposer from './adminDirectorCueComposer';
import enAdminDirectorCueFeed from './adminDirectorCueFeed';
import enAdminDirectorMatchPicker from './adminDirectorMatchPicker';
import enAdminDirectorRunStatusHeader from './adminDirectorRunStatusHeader';
import enAdminDirectorSegmentCard from './adminDirectorSegmentCard';
import enAdminDirectorSegmentEditor from './adminDirectorSegmentEditor';
import enAdminDirectorStationBoard from './adminDirectorStationBoard';
import enAdminDirectorTimelineBuilder from './adminDirectorTimelineBuilder';
import enAdminDirectorWaveBoard from './adminDirectorWaveBoard';
import enAdminSimulatorEliminationView from './adminSimulatorEliminationView';
import enAdminSimulatorSimMatchCard from './adminSimulatorSimMatchCard';
import enAdminTeamsAddMemberModal from './adminTeamsAddMemberModal';
import enAdminTeamsEditMemberModal from './adminTeamsEditMemberModal';
import enAdminTeamsImportBattleTagsModal from './adminTeamsImportBattleTagsModal';
import enAdminTeamsMemberRow from './adminTeamsMemberRow';
import enAdminTeamsMembersSection from './adminTeamsMembersSection';
import enAdminFfa from './adminFfa';
import enAdminWebhooks from './adminWebhooks';
import enAdminApiTokens from './adminApiTokens';
import enAdminApiTokenReveal from './adminApiTokenReveal';
import enAdminStats from './adminStats';
import enAdminJournals from './adminJournals';
import enAdminModeration from './adminModeration';
import enAdminPartnersHub from './adminPartnersHub';
import enAdminCommunicationsHub from './adminCommunicationsHub';
import enAdminAssociationHub from './adminAssociationHub';
import enAdminOnboarding from './adminOnboarding';
import enAdminScrimPlanningsList from './adminScrimPlanningsList';
import enAdminScrimPlanningsCreate from './adminScrimPlanningsCreate';
import enAdminScrimPlanningsDetail from './adminScrimPlanningsDetail';
import enDeveloperHub from './developerHub';
import enAdminTaskBoard from './adminTaskBoard';
import enAdminTeamMessages from './adminTeamMessages';
import enAdminCasterScenes from './adminCasterScenes';
import enAdminMatchLineups from './adminMatchLineups';
import enAdminDiscordLogs from './adminDiscordLogs';
import enAdminDocuments from './adminDocuments';
import enAdminStaffPermissions from './adminStaffPermissions';
import enAdminFreePlayers from './adminFreePlayers';

const adminEnDict = {
  adminQuickBracket: enAdminQuickBracket,
  adminLogout: enAdminLogout,
  adminForgotPassword: enAdminForgotPassword,
  adminResetPassword: enAdminResetPassword,
  adminProfile: enAdminProfile,
  adminDashboard: enAdminDashboard,
  adminAideTournoi: enAdminAideTournoi,
  adminRatings: enAdminRatings,
  adminRecycleBin: enAdminRecycleBin,
  adminLogs: enAdminLogs,
  adminEmailLogs: enAdminEmailLogs,
  adminTournamentOverview: enAdminTournamentOverview,
  adminTournamentEmbed: enAdminTournamentEmbed,
  adminTournamentDashboard: enAdminTournamentDashboard,
  adminTournamentEdit: enAdminTournamentEdit,
  adminRegistrationFields: enAdminRegistrationFields,
  adminTournamentMatches: enAdminTournamentMatches,
  adminTournamentPodium: enAdminTournamentPodium,
  adminTournamentStats: enAdminTournamentStats,
  adminTournamentAnalytics: enAdminTournamentAnalytics,
  adminTournamentHistory: enAdminTournamentHistory,
  adminTournamentBracket: enAdminTournamentBracket,
  adminTournamentBracketBuilder: enAdminTournamentBracketBuilder,
  adminTournamentStagesList: enAdminTournamentStagesList,
  adminTournamentDiscord: enAdminTournamentDiscord,
  adminTournamentVeto: enAdminTournamentVeto,
  adminTournamentMaps: enAdminTournamentMaps,
  adminMapPool: enAdminMapPool,
  adminCustomGamePresets: enAdminCustomGamePresets,
  adminTournamentMapDraw: enAdminTournamentMapDraw,
  adminTournamentCheckin: enAdminTournamentCheckin,
  adminTournamentCheckinLive: enAdminTournamentCheckinLive,
  adminTournamentBulkOps: enAdminTournamentBulkOps,
  adminTournamentNav: enAdminTournamentNav,
  adminTournamentPrizePool: enAdminTournamentPrizePool,
  adminTournamentsList: enAdminTournamentsList,
  adminTournamentsCreate: enAdminTournamentsCreate,
  adminUserPlayerView: enAdminUserPlayerView,
  adminUserCaptainView: enAdminUserCaptainView,
  adminUsersManage: enAdminUsersManage,
  adminUsersNew: enAdminUsersNew,
  adminTeamEdit: enAdminTeamEdit,
  adminTeamDetail: enAdminTeamDetail,
  adminTeamsList: enAdminTeamsList,
  adminTeamsMy: enAdminTeamsMy,
  adminTeamsNew: enAdminTeamsNew,
  adminStageNav: enAdminStageNav,
  adminStageDetail: enAdminStageDetail,
  adminStageGroups: enAdminStageGroups,
  adminStageHistory: enAdminStageHistory,
  adminStageSeeding: enAdminStageSeeding,
  adminStageSwiss: enAdminStageSwiss,
  adminStageTeams: enAdminStageTeams,
  adminStagesCreate: enAdminStagesCreate,
  adminLeagueDetail: enAdminLeagueDetail,
  adminLeaguesList: enAdminLeaguesList,
  adminDemandesList: enAdminDemandesList,
  adminDemandeDetail: enAdminDemandeDetail,
  adminAdherentsList: enAdminAdherentsList,
  adminAdherentsNew: enAdminAdherentsNew,
  adminAdherentDetail: enAdminAdherentDetail,
  adminTenantsList: enAdminTenantsList,
  adminTenantPlanCheckout: enAdminTenantPlanCheckout,
  adminTenantsNew: enAdminTenantsNew,
  adminBilling: enAdminBilling,
  adminTenantDetail: enAdminTenantDetail,
  adminTenantRequestsList: enAdminTenantRequestsList,
  adminPartnershipRequestsList: enAdminPartnershipRequestsList,
  adminPartnershipRequestDetail: enAdminPartnershipRequestDetail,
  adminOnboardingQueue: enAdminOnboardingQueue,
  adminPendingGuildLinks: enAdminPendingGuildLinks,
  adminNewsList: enAdminNewsList,
  adminNewsNew: enAdminNewsNew,
  adminNewsEdit: enAdminNewsEdit,
  adminAnnouncementsList: enAdminAnnouncementsList,
  adminAnnouncementsNew: enAdminAnnouncementsNew,
  adminAnnouncementEdit: enAdminAnnouncementEdit,
  adminPartnersList: enAdminPartnersList,
  adminPartnersNew: enAdminPartnersNew,
  adminPartnerEdit: enAdminPartnerEdit,
  adminCommentsList: enAdminCommentsList,
  adminPoleMembersList: enAdminPoleMembersList,
  adminPoleMembersNew: enAdminPoleMembersNew,
  adminPoleMemberEdit: enAdminPoleMemberEdit,
  adminCastMembersList: enAdminCastMembersList,
  adminCastMembersNew: enAdminCastMembersNew,
  adminCastMemberEdit: enAdminCastMemberEdit,
  adminTwitchChannelsList: enAdminTwitchChannelsList,
  adminTwitchChannelsNew: enAdminTwitchChannelsNew,
  adminTwitchChannelEdit: enAdminTwitchChannelEdit,
  adminScrimsList: enAdminScrimsList,
  adminScrimsCreate: enAdminScrimsCreate,
  adminScrimDetail: enAdminScrimDetail,
  adminDisputes: enAdminDisputes,
  adminBroadcastLive: enAdminBroadcastLive,
  adminTwitchPredictions: enAdminTwitchPredictions,
  adminTwitchCommands: enAdminTwitchCommands,
  adminEventsList: enAdminEventsList,
  adminNotifications: enAdminNotifications,
  adminSupport: enAdminSupport,
  adminModerationBlacklist: enAdminModerationBlacklist,
  adminModerationEntityBlacklist: enAdminModerationEntityBlacklist,
  adminMatchDraft: enAdminMatchDraft,
  adminMatchDetail: enAdminMatchDetail,
  adminMatchEdit: enAdminMatchEdit,
  adminEventDirector: enAdminEventDirector,
  adminCampaigns: enAdminCampaigns,
  adminCommandPalette: enAdminCommandPalette,
  adminDataTable: enAdminDataTable,
  adminEntityHistory: enAdminEntityHistory,
  adminSiteSettings: enAdminSiteSettings,
  adminSiteSettingsDiscord: enAdminSiteSettingsDiscord,
  adminSiteSettingsTeamRoles: enAdminSiteSettingsTeamRoles,
  adminStatsMaps: enAdminStatsMaps,
  adminStatsTeams: enAdminStatsTeams,
  adminTournamentTemplates: enAdminTournamentTemplates,
  adminTenantDiscordConfig: enAdminTenantDiscordConfig,
  adminDiscordTeamChannels: enAdminDiscordTeamChannels,
  adminTournamentSimulator: enAdminTournamentSimulator,
  adminAdvancementRulesEditor: enAdminAdvancementRulesEditor,
  adminAutoSaveIndicator: enAdminAutoSaveIndicator,
  adminBotSecretsRevealModal: enAdminBotSecretsRevealModal,
  adminBreadcrumb: enAdminBreadcrumb,
  adminCastMemberStaffPicker: enAdminCastMemberStaffPicker,
  adminConfirmDialog: enAdminConfirmDialog,
  adminDeleteConfirmModal: enAdminDeleteConfirmModal,
  adminAlertBanner: enAdminAlertBanner,
  adminLoadingSpinner: enAdminLoadingSpinner,
  adminDraftBanner: enAdminDraftBanner,
  adminLogoUpload: enAdminLogoUpload,
  adminMatchCastAssignments: enAdminMatchCastAssignments,
  adminMatchHistoryDrawer: enAdminMatchHistoryDrawer,
  adminMatchReadinessChecklist: enAdminMatchReadinessChecklist,
  adminMatchTimeline: enAdminMatchTimeline,
  adminModal: enAdminModal,
  adminTenantSwitcher: enAdminTenantSwitcher,
  adminBracketTreeView: enAdminBracketTreeView,
  adminBracketMatchCard: enAdminBracketMatchCard,
  adminBracketMatchListView: enAdminBracketMatchListView,
  adminBracketSeedSlot: enAdminBracketSeedSlot,
  adminDashboardConfirmAdvanceModal: enAdminDashboardConfirmAdvanceModal,
  adminDashboardDiscordHealthGrid: enAdminDashboardDiscordHealthGrid,
  adminDashboardDisputeResolveModal: enAdminDashboardDisputeResolveModal,
  adminDashboardScoreEntryModal: enAdminDashboardScoreEntryModal,
  adminDashboardSparkline: enAdminDashboardSparkline,
  adminDashboardStageProgressBar: enAdminDashboardStageProgressBar,
  adminDashboardSupportTicketsDonut: enAdminDashboardSupportTicketsDonut,
  adminDashboardUpcomingMatchRow: enAdminDashboardUpcomingMatchRow,
  adminDirectorAddSegmentModal: enAdminDirectorAddSegmentModal,
  adminDirectorCasterStatusPanel: enAdminDirectorCasterStatusPanel,
  adminDirectorCueComposer: enAdminDirectorCueComposer,
  adminDirectorCueFeed: enAdminDirectorCueFeed,
  adminDirectorMatchPicker: enAdminDirectorMatchPicker,
  adminDirectorRunStatusHeader: enAdminDirectorRunStatusHeader,
  adminDirectorSegmentCard: enAdminDirectorSegmentCard,
  adminDirectorSegmentEditor: enAdminDirectorSegmentEditor,
  adminDirectorStationBoard: enAdminDirectorStationBoard,
  adminDirectorTimelineBuilder: enAdminDirectorTimelineBuilder,
  adminDirectorWaveBoard: enAdminDirectorWaveBoard,
  adminSimulatorEliminationView: enAdminSimulatorEliminationView,
  adminSimulatorSimMatchCard: enAdminSimulatorSimMatchCard,
  adminTeamsAddMemberModal: enAdminTeamsAddMemberModal,
  adminTeamsEditMemberModal: enAdminTeamsEditMemberModal,
  adminTeamsImportBattleTagsModal: enAdminTeamsImportBattleTagsModal,
  adminTeamsMemberRow: enAdminTeamsMemberRow,
  adminTeamsMembersSection: enAdminTeamsMembersSection,
  adminFfa: enAdminFfa,
  adminWebhooks: enAdminWebhooks,
  adminApiTokens: enAdminApiTokens,
  adminApiTokenReveal: enAdminApiTokenReveal,
  adminStats: enAdminStats,
  adminJournals: enAdminJournals,
  adminModeration: enAdminModeration,
  adminPartnersHub: enAdminPartnersHub,
  adminCommunicationsHub: enAdminCommunicationsHub,
  adminAssociationHub: enAdminAssociationHub,
  adminOnboarding: enAdminOnboarding,
  adminScrimPlanningsList: enAdminScrimPlanningsList,
  adminScrimPlanningsCreate: enAdminScrimPlanningsCreate,
  adminScrimPlanningsDetail: enAdminScrimPlanningsDetail,
  developerHub: enDeveloperHub,
  adminTaskBoard: enAdminTaskBoard,
  adminTeamMessages: enAdminTeamMessages,
  adminCasterScenes: enAdminCasterScenes,
  adminMatchLineups: enAdminMatchLineups,
  adminDiscordLogs: enAdminDiscordLogs,
  adminDocuments: enAdminDocuments,
  adminStaffPermissions: enAdminStaffPermissions,
  adminFreePlayers: enAdminFreePlayers,
};

export default adminEnDict;
