// lib/i18n/locales/admin-en/adminTeamDetail.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamDetail`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamDetail.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin – Team',
  breadcrumbTeams: 'Teams',
  breadcrumbTeam: 'Team',
  backToList: '← Back to team list',
  teamFallback: 'Team',
  overview: 'Overview of the team and members.',
  edit: 'Edit',
  addMember: 'Add a member',
  errUnexpected: 'Unexpected error',
  loadingTeam: 'Loading team…',
  teamNotFound: 'Team not found.',
  informations: 'Information',
  tagLabel: 'Tag: {tag}',
  statusLabel: 'Status:',
  active: 'Active',
  inactive: 'Inactive',
  countryLabel: 'Country',
  websiteLabel: 'Website',
  twitterLabel: 'Twitter',
  discordLabel: 'Discord',
  description: 'Description',
  members: 'Members',
  loadingMembers: 'Loading members…',
  noMembers: 'No members yet.',
  captain: 'Captain',
  manager: 'Manager',
  battleTagVerified: '✓ verified',
  battleTagUnverified: 'unverified',
  battleTagVerifiedTitle: 'BattleTag verified via Battle.net on {date}',
  battleTagUnverifiedTitle: 'BattleTag not verified through Battle.net OAuth',
  battleTagMismatch: '⚠ verified account ≠ roster tag',
  battleTagMismatchTitle:
    "The player's verified Blizzard account does not match the roster BattleTag (potential impersonation or typo to investigate).",
  unverifiedCount: '{count} unverified',
};
