// lib/i18n/locales/en/index.ts
//
// Recomposition du dictionnaire ANGLAIS complet.
//
// C'est le point d'entree charge paresseusement par `useT` a la bascule
// FR->EN (cf. `../../lazyLocale.ts`). L'anglais reste donc UN SEUL chunk et
// UNE SEULE requete, comme du temps du `en.json` monolithique : seule
// l'ECRITURE est eclatee, un fichier par namespace, en miroir de `../fr/`.
//
// Contrairement a `../fr/index.ts` — reserve au garde-fou de parite parce
// qu'un import applicatif y re-embarquerait les 164 namespaces dans le bundle
// de la page — ce fichier-ci EST fait pour etre importe : le francais doit
// tenir dans le bundle de chaque page, l'anglais est une requete unique
// declenchee par un clic.

import enProfileSummary from './profileSummary';
import enPlayerIndex from './playerIndex';
import enSupportAssoCard from './supportAssoCard';
import enCopyButton from './copyButton';
import enEspaceCapitaine from './espaceCapitaine';
import enCheckin from './checkin';
import enPlayerMatches from './playerMatches';
import enNextMatchCard from './nextMatchCard';
import enPlayerProfile from './playerProfile';
import enCasterApplication from './casterApplication';
import enJoinTeam from './joinTeam';
import enManageTeam from './manageTeam';
import enFreePlayers from './freePlayers';
import enNewTeamForm from './newTeamForm';
import enTeamCard from './teamCard';
import enPlayerRequests from './playerRequests';
import enRequestCaptain from './requestCaptain';
import enDemandesHistory from './demandesHistory';
import enPlayerMessages from './playerMessages';
import enTeamPicker from './teamPicker';
import enPlayerNotifications from './playerNotifications';
import enDiscordLinkCard from './discordLinkCard';
import enPlayerDiscovery from './playerDiscovery';
import enPlayerTopBar from './playerTopBar';
import enNavbar from './navbar';
import enFooter from './footer';
import enNewsletterSignup from './newsletterSignup';
import enNewsletterMerci from './newsletterMerci';
import enCookieBanner from './cookieBanner';
import enOfflineBanner from './offlineBanner';
import enPwa from './pwa';
import enError403 from './error403';
import enError404 from './error404';
import enPlayerBell from './playerBell';
import enLoginPage from './loginPage';
import enActiveTeamSwitcher from './activeTeamSwitcher';
import enRegisterPage from './registerPage';
import enContactPage from './contactPage';
import enPartnerRequest from './partnerRequest';
import enDonPage from './donPage';
import enInscription2026 from './inscription2026';
import enAssociationPage from './associationPage';
import enLeaderboardPage from './leaderboardPage';
import enScrimsPage from './scrimsPage';
import enScrimLanding from './scrimLanding';
import enTournamentsList from './tournamentsList';
import enHomeV2 from './homeV2';
import enHomeEvents from './homeEvents';
import enHomeNews from './homeNews';
import enHomeSponsors from './homeSponsors';
import enPressSection from './pressSection';
import enAnnouncementsTicker from './announcementsTicker';
import enLivePage from './livePage';
import enLiveTwitchSection from './liveTwitchSection';
import enLiveEventBanner from './liveEventBanner';
import enScrimDetail from './scrimDetail';
import enMatchDetail from './matchDetail';
import enJeuxPage from './jeuxPage';
import enMentionsLegales from './mentionsLegales';
import enDeveloppeursReference from './developpeursReference';
import enDeveloppeursPage from './developpeursPage';
import enTimeline2026 from './timeline2026';
import enPartenairesPage from './partenairesPage';
import enLorePage from './lorePage';
import enAboutPage from './aboutPage';
import enTeamCreate from './teamCreate';
import enTeamAccess from './teamAccess';
import enTeamEdit from './teamEdit';
import enPlayerPublicProfile from './playerPublicProfile';
import enOnboardIndex from './onboardIndex';
import enOnboardRequest from './onboardRequest';
import enOnboardCheckEmail from './onboardCheckEmail';
import enOnboardInviteBot from './onboardInviteBot';
import enOnboardSecrets from './onboardSecrets';
import enGuideManageTeam from './guideManageTeam';
import enContactForm from './contactForm';
import enPublicScrimDialog from './publicScrimDialog';
import enMemberProfileEditor from './memberProfileEditor';
import enDiscordSignInCta from './discordSignInCta';
import enSecretRevealCard from './secretRevealCard';
import enTournamentTabs from './tournamentTabs';
import enTournamentDetail from './tournamentDetail';
import enTournamentLanding from './tournamentLanding';
import enTournamentArbitration from './tournamentArbitration';
import enTournamentBracket from './tournamentBracket';
import enTournamentMatches from './tournamentMatches';
import enTournamentMaps from './tournamentMaps';
import enTournamentStats from './tournamentStats';
import enTournamentMvp from './tournamentMvp';
import enTournamentPodium from './tournamentPodium';
import enTournamentTeams from './tournamentTeams';
import enTournamentTeamDetail from './tournamentTeamDetail';
import enTournoiPage from './tournoiPage';
import enLeaguesIndex from './leaguesIndex';
import enLeagueDetail from './leagueDetail';
import enCasterCockpit from './casterCockpit';
import enBriefingPanel from './briefingPanel';
import enLiveSegmentBlock from './liveSegmentBlock';
import enCockpitChecklist from './cockpitChecklist';
import enUrgentCueModal from './urgentCueModal';
import enCockpitHotkeys from './cockpitHotkeys';
import enCueBanner from './cueBanner';
import enCueFeed from './cueFeed';
import enUpcomingAssignments from './upcomingAssignments';
import enCastViewer from './castViewer';
import enMatchGames from './matchGames';
import enDraftPage from './draftPage';
import enDraftSpectator from './draftSpectator';
import enAppPage from './appPage';
import enSupportPage from './supportPage';
import enTeamDetail from './teamDetail';
import enTeamStats from './teamStats';
import enTeamMaps from './teamMaps';
import enActualitesPage from './actualitesPage';
import enNewsIndex from './newsIndex';
import enNewsDetail from './newsDetail';
import enCheckinToken from './checkinToken';
import enHeroPicker from './heroPicker';
import enAuthDiscordMember from './authDiscordMember';
import enPlanDuSite from './planDuSite';
import enAdminTopBar from './adminTopBar';
import enPushOptIn from './pushOptIn';
import enFloatingSocials from './floatingSocials';
import enErrorBoundary from './errorBoundary';
import enRulesPage from './rulesPage';
import enToast from './toast';
import enEmbedBracket from './embedBracket';
import enEmbedStandings from './embedStandings';
import enFfaStandings from './ffaStandings';
import enEmbedSchedule from './embedSchedule';
import enScrimPlanning from './scrimPlanning';
import enOverlay from './overlay';
import enDeveloperRegisterPage from './developerRegisterPage';
import enAdminRegie from './adminRegie';
import enRegieNewRun from './regieNewRun';
import enRegieStartPrepared from './regieStartPrepared';
import enBattlenetVerify from './battlenetVerify';
import enOverwatchRank from './overwatchRank';
import enPrintExport from './printExport';
import enSpecialty from './specialty';
import enBattlenetLogin from './battlenetLogin';
import enInvitationLink from './invitationLink';
import enTeamJoinLink from './teamJoinLink';
import enPlayerTeams from './playerTeams';
import enNetworkOnboarding from './networkOnboarding';
import enMyScrims from './myScrims';
import enTeamRhythm from './teamRhythm';
import enTeamMemory from './teamMemory';
import enTeamHealth from './teamHealth';
import enScouting from './scouting';
import enProgression from './progression';
import enRegistrationDeadline from './registrationDeadline';
import enTeamRegistration from './teamRegistration';
import enMatchLineup from './matchLineup';
import enRejoindrePage from './rejoindrePage';
import enProductionPartner from './productionPartner';
import enPalmaresPage from './palmaresPage';
import enMapsVoxelPage from './mapsVoxelPage';

const enDict = {
  profileSummary: enProfileSummary,
  playerIndex: enPlayerIndex,
  supportAssoCard: enSupportAssoCard,
  copyButton: enCopyButton,
  espaceCapitaine: enEspaceCapitaine,
  checkin: enCheckin,
  playerMatches: enPlayerMatches,
  nextMatchCard: enNextMatchCard,
  playerProfile: enPlayerProfile,
  casterApplication: enCasterApplication,
  joinTeam: enJoinTeam,
  manageTeam: enManageTeam,
  freePlayers: enFreePlayers,
  newTeamForm: enNewTeamForm,
  teamCard: enTeamCard,
  playerRequests: enPlayerRequests,
  requestCaptain: enRequestCaptain,
  demandesHistory: enDemandesHistory,
  playerMessages: enPlayerMessages,
  teamPicker: enTeamPicker,
  playerNotifications: enPlayerNotifications,
  discordLinkCard: enDiscordLinkCard,
  playerDiscovery: enPlayerDiscovery,
  playerTopBar: enPlayerTopBar,
  navbar: enNavbar,
  footer: enFooter,
  newsletterSignup: enNewsletterSignup,
  newsletterMerci: enNewsletterMerci,
  cookieBanner: enCookieBanner,
  offlineBanner: enOfflineBanner,
  pwa: enPwa,
  error403: enError403,
  error404: enError404,
  playerBell: enPlayerBell,
  loginPage: enLoginPage,
  activeTeamSwitcher: enActiveTeamSwitcher,
  registerPage: enRegisterPage,
  contactPage: enContactPage,
  partnerRequest: enPartnerRequest,
  donPage: enDonPage,
  inscription2026: enInscription2026,
  associationPage: enAssociationPage,
  leaderboardPage: enLeaderboardPage,
  scrimsPage: enScrimsPage,
  scrimLanding: enScrimLanding,
  tournamentsList: enTournamentsList,
  homeV2: enHomeV2,
  homeEvents: enHomeEvents,
  homeNews: enHomeNews,
  homeSponsors: enHomeSponsors,
  pressSection: enPressSection,
  announcementsTicker: enAnnouncementsTicker,
  livePage: enLivePage,
  liveTwitchSection: enLiveTwitchSection,
  liveEventBanner: enLiveEventBanner,
  scrimDetail: enScrimDetail,
  matchDetail: enMatchDetail,
  jeuxPage: enJeuxPage,
  mentionsLegales: enMentionsLegales,
  developpeursReference: enDeveloppeursReference,
  developpeursPage: enDeveloppeursPage,
  timeline2026: enTimeline2026,
  partenairesPage: enPartenairesPage,
  lorePage: enLorePage,
  aboutPage: enAboutPage,
  teamCreate: enTeamCreate,
  teamAccess: enTeamAccess,
  teamEdit: enTeamEdit,
  playerPublicProfile: enPlayerPublicProfile,
  onboardIndex: enOnboardIndex,
  onboardRequest: enOnboardRequest,
  onboardCheckEmail: enOnboardCheckEmail,
  onboardInviteBot: enOnboardInviteBot,
  onboardSecrets: enOnboardSecrets,
  guideManageTeam: enGuideManageTeam,
  contactForm: enContactForm,
  publicScrimDialog: enPublicScrimDialog,
  memberProfileEditor: enMemberProfileEditor,
  discordSignInCta: enDiscordSignInCta,
  secretRevealCard: enSecretRevealCard,
  tournamentTabs: enTournamentTabs,
  tournamentDetail: enTournamentDetail,
  tournamentLanding: enTournamentLanding,
  tournamentArbitration: enTournamentArbitration,
  tournamentBracket: enTournamentBracket,
  tournamentMatches: enTournamentMatches,
  tournamentMaps: enTournamentMaps,
  tournamentStats: enTournamentStats,
  tournamentMvp: enTournamentMvp,
  tournamentPodium: enTournamentPodium,
  tournamentTeams: enTournamentTeams,
  tournamentTeamDetail: enTournamentTeamDetail,
  tournoiPage: enTournoiPage,
  leaguesIndex: enLeaguesIndex,
  leagueDetail: enLeagueDetail,
  casterCockpit: enCasterCockpit,
  briefingPanel: enBriefingPanel,
  liveSegmentBlock: enLiveSegmentBlock,
  cockpitChecklist: enCockpitChecklist,
  urgentCueModal: enUrgentCueModal,
  cockpitHotkeys: enCockpitHotkeys,
  cueBanner: enCueBanner,
  cueFeed: enCueFeed,
  upcomingAssignments: enUpcomingAssignments,
  castViewer: enCastViewer,
  matchGames: enMatchGames,
  draftPage: enDraftPage,
  draftSpectator: enDraftSpectator,
  appPage: enAppPage,
  supportPage: enSupportPage,
  teamDetail: enTeamDetail,
  teamStats: enTeamStats,
  teamMaps: enTeamMaps,
  actualitesPage: enActualitesPage,
  newsIndex: enNewsIndex,
  newsDetail: enNewsDetail,
  checkinToken: enCheckinToken,
  heroPicker: enHeroPicker,
  authDiscordMember: enAuthDiscordMember,
  planDuSite: enPlanDuSite,
  adminTopBar: enAdminTopBar,
  pushOptIn: enPushOptIn,
  floatingSocials: enFloatingSocials,
  errorBoundary: enErrorBoundary,
  rulesPage: enRulesPage,
  toast: enToast,
  embedBracket: enEmbedBracket,
  embedStandings: enEmbedStandings,
  ffaStandings: enFfaStandings,
  embedSchedule: enEmbedSchedule,
  scrimPlanning: enScrimPlanning,
  overlay: enOverlay,
  developerRegisterPage: enDeveloperRegisterPage,
  adminRegie: enAdminRegie,
  regieNewRun: enRegieNewRun,
  regieStartPrepared: enRegieStartPrepared,
  battlenetVerify: enBattlenetVerify,
  overwatchRank: enOverwatchRank,
  printExport: enPrintExport,
  specialty: enSpecialty,
  battlenetLogin: enBattlenetLogin,
  invitationLink: enInvitationLink,
  teamJoinLink: enTeamJoinLink,
  playerTeams: enPlayerTeams,
  networkOnboarding: enNetworkOnboarding,
  myScrims: enMyScrims,
  teamRhythm: enTeamRhythm,
  teamMemory: enTeamMemory,
  teamHealth: enTeamHealth,
  scouting: enScouting,
  progression: enProgression,
  registrationDeadline: enRegistrationDeadline,
  teamRegistration: enTeamRegistration,
  matchLineup: enMatchLineup,
  rejoindrePage: enRejoindrePage,
  productionPartner: enProductionPartner,
  palmaresPage: enPalmaresPage,
  mapsVoxelPage: enMapsVoxelPage,
};

export default enDict;
