// lib/i18n/locales/admin-en/adminLibraryAccess.ts
//
// Traductions ANGLAISES du namespace admin `adminLibraryAccess`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminLibraryAccess.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Library access',
  subtitle:
    'Who can enter this space’s Women’s Library. A change applies without redeploying, within a few seconds at most.',
  loadError: 'Could not read the access setting.',
  effectiveLabel: 'Applied right now:',
  envOverride:
    'The API’s LIBRARY_ACCESS variable enforces “{mode}”: this setting does not apply while it is set.',
  invalidSetting:
    'The saved setting could not be read: the Library is closed (owner only) until the next save.',

  modeLegend: 'Access mode',
  modeOwner: 'Owner only',
  modeOwnerHelp:
    'The association’s owner, and no one else. This is the default.',
  modeStaff: 'Staff',
  modeStaffHelp: 'The owner and the space’s admins.',
  modeBeta: 'Closed beta',
  modeBetaHelp:
    'Staff (owner, admins), plus the players on the list and the accepted members of the listed teams.',
  modeAll: 'Open to everyone',
  modeAllHelp:
    'Any adult player with an account. Age, attestation and bans still apply.',
  listsInactive:
    'The lists below only apply in “Closed beta” mode: they are kept for later.',

  teamsHeading: 'Beta teams',
  teamsEmpty: 'No team yet.',
  teamMembersOne: '1 accepted member',
  teamMembersMany: '{count} accepted members',
  teamMembersLater: 'members counted on save',
  teamDeleted: 'Deleted',
  teamUnknown: 'Team not found',
  teamRemoveAria: 'Remove team {name} from the beta',
  teamSearchLabel: 'Add a team',
  teamSearchHelp:
    'At least 2 letters of the name. Only the team’s ACCEPTED members get in: a pending invitation opens nothing.',
  teamSearchEmpty: 'No matching team.',
  teamSearchError: 'Could not search teams.',
  teamSearchResults: 'Teams found',
  teamAdd: 'Add',
  teamAddAria: 'Add team {name} to the beta',
  teamAlreadyListed: 'Already listed',

  playersHeading: 'Beta players',
  playersEmpty: 'No player yet.',
  playerNoAvatar: 'has not entered the Library yet',
  playerPending: 'nickname checked on save',
  playerRemoveAria: 'Remove {name} from the beta',
  playerAddLabel: 'Add a player',
  playerAddHelp:
    'Her account id (full UUID, 36 characters), or her Library nickname if she has already entered it (3 to 20 characters).',
  playerAddInvalid:
    'A full account id (36 characters) or a nickname of 3 to 20 characters is required.',
  playerAddDuplicate: 'She is already on the list.',
  playerAdd: 'Add',

  remove: 'Remove',
  removalNote:
    'Removing someone blocks her requests at once. An account that has already attested still keeps the real-time channels it has joined until its session refreshes: to remove someone right away, ban her (below).',
  unsaved: 'Unsaved changes.',
  save: 'Save access',
  saving: 'Saving…',
  revert: 'Discard changes',
  saved: 'Library access saved.',
  confirmAllTitle: 'Open the Women’s Library to everyone?',
  confirmAllSubtitle:
    'Any adult player with an account will be able to enter. Is the charter published, and moderation organised?',
  confirmAllLabel: 'Open to everyone',

  errorSave: 'Could not save.',
  errorConflict:
    'The setting changed in the meantime: the current version is shown, please redo your changes.',
  errorPlayerNotFound:
    'No Library player has this nickname: use her account id instead.',
  errorTeamNotFound:
    'An added team does not exist in this space, or has just been deleted.',
  errorTooManyPlayers: 'Too many players: {max} at most.',
  errorTooManyTeams: 'Too many teams: {max} at most.',
};
