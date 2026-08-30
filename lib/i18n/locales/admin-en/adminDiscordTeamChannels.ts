// lib/i18n/locales/admin-en/adminDiscordTeamChannels.ts
//
// Traductions ANGLAISES du namespace admin `adminDiscordTeamChannels`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDiscordTeamChannels.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Team Discord channels',
  intro:
    'The bot no longer manages channels on its own. Every action starts here, and nothing fires without a click.',
  refreshAll: 'Refresh state',
  refreshing: 'Request sent…',
  neverRefreshed: 'Never refreshed',
  capturedAt: 'Seen on {date}',
  loading: 'Loading…',
  empty: 'No teams.',
  colTeam: 'Team',
  colRole: 'Role',
  colText: 'Text channel',
  colVoice: 'Voice channel',
  colAccess: 'Access',
  colActions: 'Actions',
  statusOk: 'OK',
  statusMissing: 'Missing',
  statusUnknown: '—',
  storedButGone: 'Recorded but not found on Discord',
  notProvisioned: 'Never provisioned',
  inactiveBadge: 'Inactive',
  actionProvision: 'Provision',
  actionRepair: 'Repair permissions',
  actionDeleteText: 'Delete text channel',
  actionDeleteVoice: 'Delete voice channel',
  actionManage: 'Manage access',
  actionClose: 'Close',
  accessTitle: 'Who can get in',
  accessNone: 'Nobody yet.',
  accessViaRole: 'through the team role',
  accessViaText: 'individual access — text channel',
  accessViaVoice: 'individual access — voice channel',
  accessRevoke: 'Remove',
  grantTitle: 'Grant access',
  grantHelp:
    'The team role opens both channels and marks membership. Individual access opens a single channel — for an outside coach or a guest caster.',
  grantUserLabel: 'Discord ID',
  grantUserPlaceholder: '123456789012345678',
  grantModeRole: 'Team role',
  grantModeText: 'Text channel only',
  grantModeVoice: 'Voice channel only',
  grantSubmit: 'Grant access',
  confirmDeleteTitle: 'Delete this channel?',
  confirmDeleteBody:
    'The channel and its whole history are gone for good. Nothing brings them back.',
  confirmDelete: 'Delete',
  confirmCancel: 'Cancel',
  toastQueued: 'Request sent to the bot. The state updates in a few seconds.',
  toastQueuedOffline:
    'Bot unreachable: the request is queued and will go out on its next connection.',
  toastError: 'The action failed.',
  errorLoad: 'Could not load the channel state.',
  errorInvalidId: 'Invalid Discord ID (15 to 25 digits).',
};
