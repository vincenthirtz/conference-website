// lib/i18n/locales/admin-en/adminDashboardStageProgressBar.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardStageProgressBar`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardStageProgressBar.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  stageTypeGroup: 'Group',
  stageTypeBracket: 'Bracket',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round Robin',
  stageTypeShowmatch: 'Showmatch',
  teamsCount_one: '{count} team',
  teamsCount_other: '{count} teams',
  ongoingSuffix: '· {count} ongoing',
  advanceTitle: 'Automatically advance teams to the next stage',
  advance: '🚀 Advance',
  view: 'View →',
  remaining_one: '{count} match remaining',
  remaining_other: '{count} matches remaining',
  cadenceTitle: 'Cadence over 12h: {values}',
};
