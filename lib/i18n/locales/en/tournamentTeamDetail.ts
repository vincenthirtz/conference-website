// lib/i18n/locales/en/tournamentTeamDetail.ts
//
// Traductions ANGLAISES du namespace `tournamentTeamDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentTeamDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: '{team} · {tournament}',
  metaDescription:
    'Roster, stats and results of {team} in the {tournament} tournament',
  outcomeOngoing: 'Ongoing',
  outcomeUpcoming: 'Upcoming',
  outcomeWin: 'Win',
  outcomeLoss: 'Loss',
  outcomeDraw: 'Draw',
  eyebrow: 'Tournament · Team',
  globalProfile: 'Global profile',
  backToTournament: '← Tournament',
  statPlayed: 'Matches played',
  statWins: 'Wins',
  statLosses: 'Losses',
  statWinrate: 'Winrate',
  statMvp: 'MVP',
  rosterHeading: 'Roster ({count})',
  rosterEmpty: 'No member listed.',
  starters: 'Starters',
  substitutes: 'Substitutes',
  teamStaff: 'Team staff',
  matchesHeading: 'Matches in this tournament',
  matchesEmpty: 'No match scheduled for this team in this tournament.',
  unknownMember: '— unknown —',
  captainBadge: 'CAPTAIN',
};
