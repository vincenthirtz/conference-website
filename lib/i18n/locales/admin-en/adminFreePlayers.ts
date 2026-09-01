// lib/i18n/locales/admin-en/adminFreePlayers.ts
//
// Traductions ANGLAISES du namespace admin `adminFreePlayers`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminFreePlayers.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Free players',
  eyebrow: 'Admin · Recruitment',
  heading: 'Free players',
  intro:
    'Players who flagged themselves as team-less. Two sources: the public /rejoindre form and the “Looking for a team” Discord role.',
  loading: 'Loading…',
  loadError: 'The list could not be loaded.',
  retry: 'Try again',
  empty: 'No free players yet.',
  count: '{count} profile(s)',
  colName: 'Player',
  colRoles: 'Roles',
  colLevel: 'Level',
  colAvailability: 'Availability',
  colContact: 'Contact',
  colSource: 'Source',
  colSince: 'Since',
  colActions: '',
  sourceWeb: 'Site',
  sourceDiscord: 'Discord',
  noContact: '—',
  noName: 'Unnamed',
  remove: 'Remove',
  removing: 'Removing…',
  confirmTitle: 'Remove this profile?',
  confirmBody:
    "The profile will disappear from the public list and from the captains' space.",
  confirmBodyDiscord:
    'Careful: this profile comes from the Discord role. The bot will push it back at the next sync as long as the player holds the role — for a lasting removal, take the role away on the server.',
  confirmCta: 'Remove',
  cancel: 'Cancel',
  removed: 'Profile removed.',
  removedWillReturn:
    'Profile removed — it will come back at the next Discord sync as long as the role is held.',
  removeError: 'Removal failed.',
  selfServiceNote:
    'A player who signed up from the site can remove herself: the link is in the confirmation email she received. This table is for requests arriving through another channel.',
  searchPlaceholder: 'Filter (name, role, contact…)',
  exportCsv: 'Export as CSV',
  selectedCount: '{n} selected',
  selectAll: 'Select all',
  selectRow: 'Select row',
  previousPage: 'Previous',
  nextPage: 'Next',
  pageOf: 'Page {page} / {pages}',
};
