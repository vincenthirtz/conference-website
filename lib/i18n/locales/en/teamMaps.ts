// lib/i18n/locales/en/teamMaps.ts
//
// Traductions ANGLAISES du namespace `teamMaps`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamMaps.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  notFoundHeadTitle: "Team not found – OW Women's Cup",
  notFoundTitle: 'Team not found',
  notFoundBody: 'Unable to find this team.',
  backHome: '← Back to home',
  backToTeam: 'Back to the team page',
  mapStatsBadge: 'Stats by map',
  perMapTitle: 'Performance by map',
  perMapDesc: 'Number of matches, wins, losses and winrate per map played.',
  emptyStats: 'No map statistics available for this team at the moment.',
  thMap: 'Map',
  thPlayed: 'Played',
  thW: 'W',
  thL: 'L',
  thWR: 'WR',
  thRounds: 'Rounds',
};
