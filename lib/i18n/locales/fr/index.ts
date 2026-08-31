// lib/i18n/locales/fr/index.ts
//
// Recomposition du dictionnaire francais complet.
//
// ATTENTION — reserve au garde-fou de parite (`../parity.ts`) et aux tests.
// NE JAMAIS importer depuis du code applicatif : ca re-embarquerait les
// 157 namespaces dans le bundle et annulerait tout le decoupage.
// Un composant importe le SEUL namespace dont il a besoin.

import nsProfileSummary from './profileSummary';
import nsPlayerIndex from './playerIndex';
import nsSupportAssoCard from './supportAssoCard';
import nsCopyButton from './copyButton';
import nsEspaceCapitaine from './espaceCapitaine';
import nsCheckin from './checkin';
import nsPlayerMatches from './playerMatches';
import nsNextMatchCard from './nextMatchCard';
import nsPlayerProfile from './playerProfile';
import nsCasterApplication from './casterApplication';
import nsJoinTeam from './joinTeam';
import nsActiveTeamSwitcher from './activeTeamSwitcher';
import nsManageTeam from './manageTeam';
import nsFreePlayers from './freePlayers';
import nsNewTeamForm from './newTeamForm';
import nsTeamCard from './teamCard';
import nsPlayerRequests from './playerRequests';
import nsRequestCaptain from './requestCaptain';
import nsDemandesHistory from './demandesHistory';
import nsPlayerMessages from './playerMessages';
import nsTeamPicker from './teamPicker';
import nsPlayerNotifications from './playerNotifications';
import nsDiscordLinkCard from './discordLinkCard';
import nsPlayerDiscovery from './playerDiscovery';
import nsPlayerTopBar from './playerTopBar';
import nsNavbar from './navbar';
import nsFooter from './footer';
import nsNewsletterSignup from './newsletterSignup';
import nsRejoindrePage from './rejoindrePage';
import nsNewsletterMerci from './newsletterMerci';
import nsCookieBanner from './cookieBanner';
import nsOfflineBanner from './offlineBanner';
import nsPwa from './pwa';
import nsError403 from './error403';
import nsError404 from './error404';
import nsPlayerBell from './playerBell';
import nsLoginPage from './loginPage';
import nsRegisterPage from './registerPage';
import nsContactPage from './contactPage';
import nsPartnerRequest from './partnerRequest';
import nsDonPage from './donPage';
import nsInscription2026 from './inscription2026';
import nsAssociationPage from './associationPage';
import nsLeaderboardPage from './leaderboardPage';
import nsPalmaresPage from './palmaresPage';
import nsScrimsPage from './scrimsPage';
import nsScrimLanding from './scrimLanding';
import nsTournamentsList from './tournamentsList';
import nsHomeV2 from './homeV2';
import nsHomeEvents from './homeEvents';
import nsHomeNews from './homeNews';
import nsHomeSponsors from './homeSponsors';
import nsPressSection from './pressSection';
import nsAnnouncementsTicker from './announcementsTicker';
import nsLivePage from './livePage';
import nsLiveTwitchSection from './liveTwitchSection';
import nsLiveEventBanner from './liveEventBanner';
import nsScrimDetail from './scrimDetail';
import nsMatchDetail from './matchDetail';
import nsJeuxPage from './jeuxPage';
import nsMapsVoxelPage from './mapsVoxelPage';
import nsMentionsLegales from './mentionsLegales';
import nsDeveloppeursReference from './developpeursReference';
import nsDeveloppeursPage from './developpeursPage';
import nsTimeline2026 from './timeline2026';
import nsPartenairesPage from './partenairesPage';
import nsLorePage from './lorePage';
import nsAboutPage from './aboutPage';
import nsTeamCreate from './teamCreate';
import nsTeamAccess from './teamAccess';
import nsTeamEdit from './teamEdit';
import nsPlayerPublicProfile from './playerPublicProfile';
import nsOnboardIndex from './onboardIndex';
import nsOnboardRequest from './onboardRequest';
import nsOnboardCheckEmail from './onboardCheckEmail';
import nsOnboardInviteBot from './onboardInviteBot';
import nsOnboardSecrets from './onboardSecrets';
import nsGuideManageTeam from './guideManageTeam';
import nsContactForm from './contactForm';
import nsPublicScrimDialog from './publicScrimDialog';
import nsMemberProfileEditor from './memberProfileEditor';
import nsDiscordSignInCta from './discordSignInCta';
import nsSecretRevealCard from './secretRevealCard';
import nsTournamentTabs from './tournamentTabs';
import nsTournamentDetail from './tournamentDetail';
import nsTournamentLanding from './tournamentLanding';
import nsTournamentArbitration from './tournamentArbitration';
import nsTournamentBracket from './tournamentBracket';
import nsTournamentMatches from './tournamentMatches';
import nsTournamentMaps from './tournamentMaps';
import nsTournamentStats from './tournamentStats';
import nsTournamentMvp from './tournamentMvp';
import nsTournamentPodium from './tournamentPodium';
import nsTournamentTeams from './tournamentTeams';
import nsTournamentTeamDetail from './tournamentTeamDetail';
import nsTournoiPage from './tournoiPage';
import nsLeaguesIndex from './leaguesIndex';
import nsLeagueDetail from './leagueDetail';
import nsCasterCockpit from './casterCockpit';
import nsBriefingPanel from './briefingPanel';
import nsLiveSegmentBlock from './liveSegmentBlock';
import nsCockpitChecklist from './cockpitChecklist';
import nsUrgentCueModal from './urgentCueModal';
import nsCockpitHotkeys from './cockpitHotkeys';
import nsCueBanner from './cueBanner';
import nsCueFeed from './cueFeed';
import nsUpcomingAssignments from './upcomingAssignments';
import nsCastViewer from './castViewer';
import nsMatchGames from './matchGames';
import nsDraftPage from './draftPage';
import nsDraftSpectator from './draftSpectator';
import nsAppPage from './appPage';
import nsSupportPage from './supportPage';
import nsTeamDetail from './teamDetail';
import nsTeamStats from './teamStats';
import nsTeamMaps from './teamMaps';
import nsActualitesPage from './actualitesPage';
import nsNewsIndex from './newsIndex';
import nsNewsDetail from './newsDetail';
import nsCheckinToken from './checkinToken';
import nsHeroPicker from './heroPicker';
import nsAuthDiscordMember from './authDiscordMember';
import nsPlanDuSite from './planDuSite';
import nsAdminTopBar from './adminTopBar';
import nsPushOptIn from './pushOptIn';
import nsFloatingSocials from './floatingSocials';
import nsErrorBoundary from './errorBoundary';
import nsRulesPage from './rulesPage';
import nsToast from './toast';
import nsEmbedBracket from './embedBracket';
import nsEmbedStandings from './embedStandings';
import nsFfaStandings from './ffaStandings';
import nsEmbedSchedule from './embedSchedule';
import nsScrimPlanning from './scrimPlanning';
import nsOverlay from './overlay';
import nsDeveloperRegisterPage from './developerRegisterPage';
import nsAdminRegie from './adminRegie';
import nsRegieNewRun from './regieNewRun';
import nsRegieStartPrepared from './regieStartPrepared';
import nsBattlenetVerify from './battlenetVerify';
import nsOverwatchRank from './overwatchRank';
import nsPrintExport from './printExport';
import nsSpecialty from './specialty';
import nsBattlenetLogin from './battlenetLogin';
import nsInvitationLink from './invitationLink';
import nsTeamJoinLink from './teamJoinLink';
import nsPlayerTeams from './playerTeams';
import nsNetworkOnboarding from './networkOnboarding';
import nsMyScrims from './myScrims';
import nsTeamRhythm from './teamRhythm';
import nsTeamMemory from './teamMemory';
import nsTeamHealth from './teamHealth';
import nsScouting from './scouting';
import nsProgression from './progression';
import nsRegistrationDeadline from './registrationDeadline';
import nsTeamRegistration from './teamRegistration';
import nsMatchLineup from './matchLineup';
import nsProductionPartner from './productionPartner';

export const frDict = {
  profileSummary: nsProfileSummary.fr,
  playerIndex: nsPlayerIndex.fr,
  supportAssoCard: nsSupportAssoCard.fr,
  copyButton: nsCopyButton.fr,
  espaceCapitaine: nsEspaceCapitaine.fr,
  checkin: nsCheckin.fr,
  playerMatches: nsPlayerMatches.fr,
  nextMatchCard: nsNextMatchCard.fr,
  playerProfile: nsPlayerProfile.fr,
  casterApplication: nsCasterApplication.fr,
  joinTeam: nsJoinTeam.fr,
  activeTeamSwitcher: nsActiveTeamSwitcher.fr,
  manageTeam: nsManageTeam.fr,
  freePlayers: nsFreePlayers.fr,
  newTeamForm: nsNewTeamForm.fr,
  teamCard: nsTeamCard.fr,
  playerRequests: nsPlayerRequests.fr,
  requestCaptain: nsRequestCaptain.fr,
  demandesHistory: nsDemandesHistory.fr,
  playerMessages: nsPlayerMessages.fr,
  teamPicker: nsTeamPicker.fr,
  playerNotifications: nsPlayerNotifications.fr,
  discordLinkCard: nsDiscordLinkCard.fr,
  playerDiscovery: nsPlayerDiscovery.fr,
  playerTopBar: nsPlayerTopBar.fr,
  navbar: nsNavbar.fr,
  footer: nsFooter.fr,
  newsletterSignup: nsNewsletterSignup.fr,
  rejoindrePage: nsRejoindrePage.fr,
  newsletterMerci: nsNewsletterMerci.fr,
  cookieBanner: nsCookieBanner.fr,
  offlineBanner: nsOfflineBanner.fr,
  pwa: nsPwa.fr,
  error403: nsError403.fr,
  error404: nsError404.fr,
  playerBell: nsPlayerBell.fr,
  loginPage: nsLoginPage.fr,
  registerPage: nsRegisterPage.fr,
  contactPage: nsContactPage.fr,
  partnerRequest: nsPartnerRequest.fr,
  donPage: nsDonPage.fr,
  inscription2026: nsInscription2026.fr,
  associationPage: nsAssociationPage.fr,
  leaderboardPage: nsLeaderboardPage.fr,
  palmaresPage: nsPalmaresPage.fr,
  scrimsPage: nsScrimsPage.fr,
  scrimLanding: nsScrimLanding.fr,
  tournamentsList: nsTournamentsList.fr,
  homeV2: nsHomeV2.fr,
  homeEvents: nsHomeEvents.fr,
  homeNews: nsHomeNews.fr,
  homeSponsors: nsHomeSponsors.fr,
  pressSection: nsPressSection.fr,
  announcementsTicker: nsAnnouncementsTicker.fr,
  livePage: nsLivePage.fr,
  liveTwitchSection: nsLiveTwitchSection.fr,
  liveEventBanner: nsLiveEventBanner.fr,
  scrimDetail: nsScrimDetail.fr,
  matchDetail: nsMatchDetail.fr,
  jeuxPage: nsJeuxPage.fr,
  mapsVoxelPage: nsMapsVoxelPage.fr,
  mentionsLegales: nsMentionsLegales.fr,
  developpeursReference: nsDeveloppeursReference.fr,
  developpeursPage: nsDeveloppeursPage.fr,
  timeline2026: nsTimeline2026.fr,
  partenairesPage: nsPartenairesPage.fr,
  lorePage: nsLorePage.fr,
  aboutPage: nsAboutPage.fr,
  teamCreate: nsTeamCreate.fr,
  teamAccess: nsTeamAccess.fr,
  teamEdit: nsTeamEdit.fr,
  playerPublicProfile: nsPlayerPublicProfile.fr,
  onboardIndex: nsOnboardIndex.fr,
  onboardRequest: nsOnboardRequest.fr,
  onboardCheckEmail: nsOnboardCheckEmail.fr,
  onboardInviteBot: nsOnboardInviteBot.fr,
  onboardSecrets: nsOnboardSecrets.fr,
  guideManageTeam: nsGuideManageTeam.fr,
  contactForm: nsContactForm.fr,
  publicScrimDialog: nsPublicScrimDialog.fr,
  memberProfileEditor: nsMemberProfileEditor.fr,
  discordSignInCta: nsDiscordSignInCta.fr,
  secretRevealCard: nsSecretRevealCard.fr,
  tournamentTabs: nsTournamentTabs.fr,
  tournamentDetail: nsTournamentDetail.fr,
  tournamentLanding: nsTournamentLanding.fr,
  tournamentArbitration: nsTournamentArbitration.fr,
  tournamentBracket: nsTournamentBracket.fr,
  tournamentMatches: nsTournamentMatches.fr,
  tournamentMaps: nsTournamentMaps.fr,
  tournamentStats: nsTournamentStats.fr,
  tournamentMvp: nsTournamentMvp.fr,
  tournamentPodium: nsTournamentPodium.fr,
  tournamentTeams: nsTournamentTeams.fr,
  tournamentTeamDetail: nsTournamentTeamDetail.fr,
  tournoiPage: nsTournoiPage.fr,
  leaguesIndex: nsLeaguesIndex.fr,
  leagueDetail: nsLeagueDetail.fr,
  casterCockpit: nsCasterCockpit.fr,
  briefingPanel: nsBriefingPanel.fr,
  liveSegmentBlock: nsLiveSegmentBlock.fr,
  cockpitChecklist: nsCockpitChecklist.fr,
  urgentCueModal: nsUrgentCueModal.fr,
  cockpitHotkeys: nsCockpitHotkeys.fr,
  cueBanner: nsCueBanner.fr,
  cueFeed: nsCueFeed.fr,
  upcomingAssignments: nsUpcomingAssignments.fr,
  castViewer: nsCastViewer.fr,
  matchGames: nsMatchGames.fr,
  draftPage: nsDraftPage.fr,
  draftSpectator: nsDraftSpectator.fr,
  appPage: nsAppPage.fr,
  supportPage: nsSupportPage.fr,
  teamDetail: nsTeamDetail.fr,
  teamStats: nsTeamStats.fr,
  teamMaps: nsTeamMaps.fr,
  actualitesPage: nsActualitesPage.fr,
  newsIndex: nsNewsIndex.fr,
  newsDetail: nsNewsDetail.fr,
  checkinToken: nsCheckinToken.fr,
  heroPicker: nsHeroPicker.fr,
  authDiscordMember: nsAuthDiscordMember.fr,
  planDuSite: nsPlanDuSite.fr,
  adminTopBar: nsAdminTopBar.fr,
  pushOptIn: nsPushOptIn.fr,
  floatingSocials: nsFloatingSocials.fr,
  errorBoundary: nsErrorBoundary.fr,
  rulesPage: nsRulesPage.fr,
  toast: nsToast.fr,
  embedBracket: nsEmbedBracket.fr,
  embedStandings: nsEmbedStandings.fr,
  ffaStandings: nsFfaStandings.fr,
  embedSchedule: nsEmbedSchedule.fr,
  scrimPlanning: nsScrimPlanning.fr,
  overlay: nsOverlay.fr,
  developerRegisterPage: nsDeveloperRegisterPage.fr,
  adminRegie: nsAdminRegie.fr,
  regieNewRun: nsRegieNewRun.fr,
  regieStartPrepared: nsRegieStartPrepared.fr,
  battlenetVerify: nsBattlenetVerify.fr,
  overwatchRank: nsOverwatchRank.fr,
  printExport: nsPrintExport.fr,
  specialty: nsSpecialty.fr,
  battlenetLogin: nsBattlenetLogin.fr,
  invitationLink: nsInvitationLink.fr,
  teamJoinLink: nsTeamJoinLink.fr,
  playerTeams: nsPlayerTeams.fr,
  networkOnboarding: nsNetworkOnboarding.fr,
  myScrims: nsMyScrims.fr,
  teamRhythm: nsTeamRhythm.fr,
  teamMemory: nsTeamMemory.fr,
  teamHealth: nsTeamHealth.fr,
  scouting: nsScouting.fr,
  progression: nsProgression.fr,
  registrationDeadline: nsRegistrationDeadline.fr,
  teamRegistration: nsTeamRegistration.fr,
  matchLineup: nsMatchLineup.fr,
  productionPartner: nsProductionPartner.fr,
};
