// lib/i18n/locales/en/adminTopBar.ts
//
// Traductions ANGLAISES du namespace `adminTopBar`.
//
// La SOURCE DE VERITE est le francais (`../fr/adminTopBar.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  accueilAria: 'Home',
  openProfileAria: 'Open my profile',
  staffFallback: 'Staff',
  siteMenu: 'Site',
  crumbAria: 'Breadcrumb',
  crumbRoot: 'Admin',
  crumbTournament: 'Tournament',
  crumbMatch: 'Match',
  crumbStage: 'Stage',
  crumbTeam: 'Team',
  crumbUser: 'User',
  crumbTenant: 'Space',
  crumbScrim: 'Scrim',
  crumbPlanning: 'Planning',
  crumbLeague: 'League',
  crumbEvent: 'Event',
  crumbCaster: 'Caster',
  logout: 'Log out',
  alertsActive_one: '{count} active alert',
  alertsActive_other: '{count} active alerts',
  shellNavAria: 'Admin navigation',
  search: 'Search…',
  searchAria: 'Search (⌘K)',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  orgKicker: 'Administration',
  siteLink: 'View site',
  alertsLink: 'Open the current tournament',
};
