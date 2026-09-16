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
  tabReadiness: 'Spaces',
  readinessLoading: 'Loading spaces…',
  readinessLoadError: 'Space status unavailable.',
  readinessEmpty: 'No space to show.',
  readinessAllReady: 'Every space is operational.',
  readinessBlockedCount: '{count} space(s) still have something to sort out.',
  readinessOnlyBlocked: 'Only those needing attention',
  readinessReady: 'Operational',
  readinessBlockers: '{count} to sort out',
  readinessTrial: 'Trial',
  readinessTrialDays: 'Trial — {days} d',
  readinessTrialEndingSoon: 'Trial ending soon',
  criterionBot: 'Bot',
  criterionGuilds: '{count} server(s)',
  criterionBotSecrets: 'Bot secrets',
  criterionApiKeys: '{count} API key(s)',
  mintKeyCta: 'Issue an API key',
  grantAccessCta: 'Grant access to someone',
  tabApiKeys: 'API keys',
  apiKeysIntro:
    'Keys across every space. Issuing from a space’s own row guarantees it belongs to that space — the token decides the space, and no parameter can move it afterwards.',
  apiKeysLoadError: 'Could not load the keys.',
  apiKeysEmpty: 'No key for this space.',
  apiKeysCompTag: 'partner',
  apiKeysRevokedTag: 'revoked',
  apiKeysExpiredTag: 'expired',
  apiKeysExpiringSoon: 'expires in {days} d',
  apiKeysRevokeCta: 'Revoke',
  apiKeysRevokeConfirm:
    'Revoke the key “{name}”? Calls using it will fail immediately.',
  apiKeysRevokeError: 'Could not revoke the key.',
  grantAccessTitle: 'Grant access to {tenant}',
  grantAccessIntro:
    'An email address is enough. If the person already has an account they are attached right away; otherwise they get an invitation.',
  grantAccessEmailLabel: 'Email address',
  grantAccessRoleLabel: 'Role on this space',
  grantAccessRoleHint:
    'The role applies to this space only: it raises, it never spills over. An owner can grant access to the rest of their team themselves.',
  grantAccessSubmit: 'Grant access',
  grantAccessBusy: 'Working…',
  grantAccessCancel: 'Cancel',
  grantAccessClose: 'Close',
  grantAccessAttached: '{email} already had an account: they are now attached.',
  grantAccessAttachedHint:
    'Nothing else to do. This space is available to them at their next sign-in.',
  grantAccessInvited: 'Invitation sent to {email}.',
  grantAccessInvitedHint:
    'Valid for 14 days. They must be signed in with that address when they click — without an account the link cannot go through.',
  grantAccessError: 'Could not grant access.',
  grantAccessErrorNoEmail: 'Enter an email address.',
  mintKeyTitle: 'API key for {tenant}',
  mintKeyIntro:
    'The key will belong to this space, and only this one. It is shown once.',
  mintKeyNameLabel: 'Key name',
  mintKeyScopesLabel: 'Scopes',
  mintKeyExpiryLabel: 'Expires in (days)',
  mintKeyExpiryHint:
    'Leave empty for a key with no expiry — best avoided: a key outlives the reason it was created for.',
  mintKeyCompLabel: 'Partner key (free access)',
  mintKeyCompHint:
    'Bypasses the plan gate entirely: read and write, no quota, even once the space plan has expired.',
  mintKeyCompNotePlaceholder: 'Why this exemption? (recorded)',
  mintKeyCancel: 'Cancel',
  mintKeySubmit: 'Issue for {tenant}',
  mintKeyBusy: 'Issuing…',
  mintKeyError: 'Could not issue the key.',
  mintKeyErrorNoScope: 'Pick at least one scope.',
  criterionConfig: '{count} Discord setting(s)',
  criterionOwners: '{count} owner(s)',
  criterionEmail: 'Email sending',
  blockerInactive: 'Space disabled',
  blockerNoGuild: 'No Discord server',
  blockerNoStaff: 'Nobody attached to the space',
  blockerNoBotSecrets: 'Bot has no secrets: it will not answer',
  blockerNoConfig: 'Discord not configured',
  blockerNoEmail: 'Email sending not set up',
  attachGuildCta: 'Attach a server',
  attachGuildTitle: 'Attach a Discord server',
  attachGuildSubtitle: 'The server will be driven by the “{name}” space.',
  attachGuildPendingLabel: 'Servers waiting to be attached',
  attachGuildPendingNone: '— Pick one —',
  attachGuildNoPending: 'No server waiting: enter the identifier below.',
  attachGuildManualLabel: 'Or the server identifier',
  attachGuildManualHelp:
    'Discord › Settings › Advanced › Developer mode, then right-click the server › Copy ID.',
  attachGuildBotDelay:
    'The bot picks the link up when its cache refreshes (about 5 minutes). Nothing to redeploy.',
  attachGuildSubmit: 'Attach',
  attachGuildSaving: 'Attaching…',
  attachGuildCancel: 'Cancel',
  attachGuildInvalid: 'Invalid server identifier (15 to 25 digits).',
  attachGuildDone: 'Server attached to “{name}”.',
  attachGuildError: 'Could not attach.',
  attachGuildInviteHeading: '1. Invite the bot to the server',
  attachGuildInviteHelp:
    'Opens Discord in a tab. Once the bot is added, come back here and refresh: the server shows up in the list below.',
  attachGuildInviteCta: 'Invite the bot',
  attachGuildRefresh: 'Refresh the list',
  attachGuildRefreshing: 'Refreshing…',
  attachGuildInviteUnavailable:
    'Invitation unavailable: DISCORD_CLIENT_ID is not configured server-side.',
  configureChannelsCta: 'Configure the channels',
  configureChannelsCount: '{count} setting(s)',
  guildPrimaryTag: 'primary',
  attachGuildInviteHelpDirect:
    'This link carries this space: once the install is done, Discord brings you back here and the server is attached on its own. Nothing to copy, nothing to find in a queue.',
};
