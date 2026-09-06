// lib/i18n/locales/admin-en/adminTenantDiscordConfig.ts
//
// Traductions ANGLAISES du namespace admin `adminTenantDiscordConfig`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTenantDiscordConfig.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  previewCardHeading: 'Welcome {name}! 🎉',
  previewCardFooter: 'Member #{count}',
  previewAvatarAlt: "New member's avatar (example)",
  fieldStaffLogLabel: 'Staff log channel',
  fieldStaffLogHelp:
    'Staff logs / moderation audit trail. Fallback env STAFF_LOG_CHANNEL_ID.',
  fieldMatchesLiveLabel: 'Live matches channel',
  fieldMatchesLiveHelp:
    'Live match announcements. Fallback env MATCHES_LIVE_CHANNEL_ID.',
  fieldDisputesForumLabel: 'Disputes forum',
  fieldDisputesForumHelp:
    'Forum where the bot opens dispute threads. Fallback env DISPUTES_FORUM_CHANNEL_ID.',
  fieldNewsIngestLabel: 'News ingest channel',
  fieldNewsIngestHelp:
    'Blizzard news ingestion. Fallback env NEWS_INGEST_CHANNEL_ID.',
  fieldScrimsAnnounceLabel: 'Scrims announcements channel',
  fieldScrimsAnnounceHelp:
    'Scrim announcements. Fallback env SCRIMS_ANNOUNCE_CHANNEL_ID.',
  fieldMemberLeaveLabel: 'Departures channel',
  fieldMemberLeaveHelp:
    'Notifies when a member leaves the server (departure embed). Empty = disabled. Fallback env MEMBER_LEAVE_CHANNEL_ID.',
  fieldTeamsVoiceLabel: 'Teams voice category',
  fieldTeamsVoiceHelp:
    'Category where the bot creates team voice channels. Fallback env TEAMS_VOICE_CATEGORY_ID.',
  fieldCaptainRoleLabel: 'Captain role',
  fieldCaptainRoleHelp: '"Captain" Discord role. Fallback env CAPTAIN_ROLE_ID.',
  fieldSubstituteRoleLabel: 'Substitute role',
  fieldSubstituteRoleHelp:
    '"Substitute" Discord role. Fallback env SUBSTITUTE_ROLE_ID.',
  fieldStaffOwnerLabel: 'Staff role — Owner',
  fieldStaffOwnerHelp: 'Discord role mapped to the staff owner role.',
  fieldStaffAdminLabel: 'Staff role — Admin',
  fieldStaffAdminHelp: 'Discord role mapped to the staff admin role.',
  fieldStaffManagerLabel: 'Staff role — Manager',
  fieldStaffManagerHelp: 'Discord role mapped to the staff manager role.',
  fieldStaffCasterLabel: 'Staff role — Caster',
  fieldStaffCasterHelp: 'Discord role mapped to the staff caster role.',
  fieldTagOpenLabel: 'Dispute tag — Open',
  fieldTagOpenHelp:
    'ID of the forum tag applied to open disputes (not a channel: tag ID).',
  fieldTagPendingLabel: 'Dispute tag — Pending',
  fieldTagPendingHelp: 'ID of the forum tag for disputes awaiting arbitration.',
  fieldTagResolvedLabel: 'Dispute tag — Resolved',
  fieldTagResolvedHelp: 'ID of the forum tag for resolved disputes.',
  roleManagedSuffix: ' (managed)',
  sectionChannels: 'Channels',
  sectionVoice: 'Voice / Category',
  sectionRoles: 'Discord roles',
  sectionTags: 'Dispute forum tags',
  inventoryError: 'Unable to list channels (bot unreachable?).',
  errorSnowflakeInvalid: 'Invalid snowflake',
  errorSnowflakeInvalidItem: 'Invalid snowflake: {value}',
  errorLoad: 'Loading error',
  errorFixSnowflakes: 'Fix the invalid snowflakes before saving.',
  saveSuccess: 'Discord configuration saved.',
  errorSave: 'Unable to save.',
  pageTitle: 'Admin – Discord config',
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Tenants',
  breadcrumbDiscordConfig: 'Discord config',
  heading: 'Discord configuration',
  guildIdLabel: 'Guild ID:',
  fallbackNote:
    'Leaving a field empty restores the fallback (bot environment variables).',
  inventoryLoading: 'Loading…',
  inventoryReload: '↻ Reload channels & roles',
  inventoryList: "📋 List the server's channels & roles",
  inventoryLoaded:
    '✓ {channels} channels · {roles} roles loaded — selectors enabled',
  loadingConfig: 'Loading configuration…',
  selectNoneFallback: '— None (env fallback) —',
  currentId: 'Current ID: {value}',
  clear: 'Clear',
  clearFallbackTitle: 'Clear (use env fallback)',
  welcomeHeading: 'Welcoming new members',
  welcomeEnableLabel: 'Enable welcome message',
  welcomeEnableHelp:
    'Automatically posts a message when a member joins the server.',
  welcomeChannelLabel: 'Arrival channel',
  selectNoneNoMessage: '— None (no message) —',
  clearTitle: 'Clear',
  welcomeChannelHelp:
    "ID of the channel where the welcome card is posted. Set = the bot posts a rich card (new member's avatar) on each arrival; empty = no public message.",
  welcomeMessageLabel: 'Public message',
  welcomeMessageHelp:
    'Left empty = default rich message. placeholders: {user} = mention, {server} = server name, {count} = member number',
  previewLabel: 'Preview',
  previewNoChannelWarning:
    "Set an arrival channel to enable the card (the bot won't post without a channel).",
  welcomeDmLabel: 'Direct message (DM)',
  welcomeDmHelp: 'left empty = no DM; same placeholders',
  previewDmLabel: 'DM preview',
  saving: 'Saving…',
  saveSubmit: 'Save configuration',
  backToTenant: 'Back to tenant',
  serverFallback: 'your server',
  welcomeExample1: 'Welcome {user} to {server}!',
  welcomeExample2: 'Hi {user}, welcome to {server}!',
  placementTitle: 'Roles by final ranking',
  placementHelp:
    'When a tournament is finalised, each team receives every role whose range it satisfies. Ranges may overlap: the winner deserves “Winner” AND “Podium” AND “Participant”.',
  placementEmpty: 'No role granted automatically.',
  placementAdd: 'Add a rule',
  placementRemove: 'Remove',
  placementFrom: 'From place',
  placementTo: 'to place',
  placementToPlaceholder: 'last',
  placementRole: 'Discord role ID',
  placementRolePlaceholder: '123456789012345678',
  placementName: 'Name (for your own reference)',
  placementNamePlaceholder: 'Winner 2026',
  placementInvalidRole: 'A Discord role ID is 15 to 25 digits.',
};
