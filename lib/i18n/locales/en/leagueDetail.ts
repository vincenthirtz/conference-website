// lib/i18n/locales/en/leagueDetail.ts
//
// Traductions ANGLAISES du namespace `leagueDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/leagueDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusDraft: 'Draft',
  statusActive: 'Ongoing',
  statusFinished: 'Finished',
  statusArchived: 'Archived',
  backToLeagues: '← Back to leagues',
  standingsHeading: 'Standings',
  tournamentsHeading: 'Tournaments of the season',
  scrimsHeading: 'Scrims of the season',
  standingsEmpty:
    'No ranking available at the moment. Points will appear as soon as a tournament of the season is finished.',
  colRank: 'Rank',
  colTeam: 'Team',
  colPoints: 'Points',
  colTournaments: 'Tournaments',
  colScrims: 'Scrims',
  colBestRank: 'Best rank',
  unknownTeam: 'Unknown team',
  tournamentsEmpty: 'No tournament attached to this season yet.',
  tournamentFallback: 'Tournament',
  scrimsEmpty: 'No scrim attached to this season yet.',
  scrimFallback: 'Scrim',
  notFoundHeading: 'League not found',
  notFoundBody: 'This league does not exist or is not public.',
  viewLeagues: 'View leagues',
  errorHeading: 'Unable to load this league',
  errorBody: 'An error occurred. Try again in a few moments.',
  retry: 'Retry',
};
