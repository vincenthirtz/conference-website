// lib/i18n/locales/admin-en/adminOnboarding.ts
//
// Traductions ANGLAISES du namespace admin `adminOnboarding`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminOnboarding.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Onboarding',
  heading: 'Onboarding',
  subtitle:
    'Getting spaces running, and what is waiting at the door: self-service requests, Discord servers pending.',
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Onboarding',
  tabsAriaLabel: "Sections d'onboarding",
  tabInbox: 'To handle',
  createTenantCta: 'Create a space',
  tabReadiness: "Spaces",
  readinessLoading: "Loading spaces…",
  readinessLoadError: "Space status unavailable.",
  readinessEmpty: "No space to show.",
  readinessAllReady: "Every space is operational.",
  readinessBlockedCount: "{count} space(s) still have something to sort out.",
  readinessOnlyBlocked: "Only those needing attention",
  readinessReady: "Operational",
  readinessBlockers: "{count} to sort out",
  readinessTrial: "Trial",
  readinessTrialDays: "Trial — {days} d",
  readinessTrialEndingSoon: "Trial ending soon",
  criterionBot: "Bot",
  criterionGuilds: "{count} server(s)",
  criterionConfig: "{count} Discord setting(s)",
  criterionOwners: "{count} owner(s)",
  criterionEmail: "Email sending",
  blockerInactive: "Space disabled",
  blockerNoPlan: "Plan without bot",
  blockerNoGuild: "No Discord server",
  blockerNoStaff: "Nobody attached to the space",
  blockerNoConfig: "Discord not configured",
  blockerNoEmail: "Email sending not set up",
  attachGuildCta: "Attach a server",
  attachGuildTitle: "Attach a Discord server",
  attachGuildSubtitle: "The server will be driven by the “{name}” space.",
  attachGuildPendingLabel: "Servers waiting to be attached",
  attachGuildPendingNone: "— Pick one —",
  attachGuildNoPending: "No server waiting: enter the identifier below.",
  attachGuildManualLabel: "Or the server identifier",
  attachGuildManualHelp: "Discord › Settings › Advanced › Developer mode, then right-click the server › Copy ID.",
  attachGuildBotDelay: "The bot picks the link up when its cache refreshes (about 5 minutes). Nothing to redeploy.",
  attachGuildSubmit: "Attach",
  attachGuildSaving: "Attaching…",
  attachGuildCancel: "Cancel",
  attachGuildInvalid: "Invalid server identifier (15 to 25 digits).",
  attachGuildDone: "Server attached to “{name}”.",
  attachGuildError: "Could not attach.",
  attachGuildInviteHeading: "1. Invite the bot to the server",
  attachGuildInviteHelp: "Opens Discord in a tab. Once the bot is added, come back here and refresh: the server shows up in the list below.",
  attachGuildInviteCta: "Invite the bot",
  attachGuildRefresh: "Refresh the list",
  attachGuildRefreshing: "Refreshing…",
  attachGuildInviteUnavailable: "Invitation unavailable: DISCORD_CLIENT_ID is not configured server-side.",
  configureChannelsCta: "Configure the channels",
  configureChannelsCount: "{count} setting(s)",
  guildPrimaryTag: "primary",
  attachGuildInviteHelpDirect:
    'This link carries this space: once the install is done, Discord brings you back here and the server is attached on its own. Nothing to copy, nothing to find in a queue.',
};
