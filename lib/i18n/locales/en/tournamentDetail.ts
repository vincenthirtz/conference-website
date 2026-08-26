// lib/i18n/locales/en/tournamentDetail.ts
//
// Traductions ANGLAISES du namespace `tournamentDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/tournamentDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  statusUpcoming: 'Upcoming',
  statusOngoing: 'Ongoing',
  statusFinished: 'Finished',
  seasonLabel: 'Season',
  heroDescription:
    "Follow the bracket, results, maps and teams of this OW Women's Cup edition. Everything you need to cast, analyse or simply enjoy the tournament.",
  ctaBracket: 'View bracket',
  ctaAllMatches: 'All matches',
  ctaTopMaps: 'Top maps',
  ctaFfaStandings: 'FFA standings',
  ctaOfficialPodium: 'Official podium',
  ctaRegisterTeam: 'Register my team',
  rulesLink: 'Tournament rules',
  statTeams: 'Teams',
  statMatches: 'Matches',
  statStages: 'Stages',
  statFormat: 'Format',
  hintRegistered: '{count}/{max} registered',
  hintFinished: '{count} finished',
  infoTitle: 'Info',
  scheduleTitle: 'Schedule',
  scheduleRulesTitle: 'Scheduling rules',
  formatDetailsTitle: 'Format details',
  stagesHeading: 'Tournament stages',
  stagesCount_one: '{count} stage',
  stagesCount_other: '{count} stages',
  stagesEmpty: 'The stages of this tournament are not published yet.',
  stageTypeGroup: 'Group',
  stageTypeBracket: 'Bracket',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round robin',
  stageTypeShowmatch: 'Showmatch',
  stageTypeOther: 'Other',
  stageSwissRounds: ' · {count} rounds',
  stageFormatLabel: 'Format: {format}',
  bracketLabel: 'Bracket',
  keyMatchesHeading: 'Key matches',
  viewAllMatches: 'View all matches →',
  upcomingHeading: 'Upcoming matches',
  upcomingEmpty: 'No upcoming match scheduled.',
  recentHeading: 'Latest results',
  recentEmpty: 'No result published.',
  teamsHeading: 'Tournament teams',
  teamsCount_one: '{count} team',
  teamsCount_other: '{count} teams',
  teamsEmpty: 'Teams are not displayed yet for this tournament.',
  teamsMore: '+ {count} more',
  mapsHeading: 'Maps overview',
  viewAllMaps: 'View all maps →',
  mapsDescription:
    'Check the most played maps of the tournament, overtimes and tiebreakers to analyse the map meta.',
  mapsNoteBefore:
    'Detailed stats (popularity, overtimes, average rounds) are available on the ',
  mapsNoteLink: 'Top maps',
  mapsNoteAfter: ' page.',
  vsLabel: 'vs',
  byeLabel: '(bye)',
  teamPlaceholder1: 'Team 1',
  teamPlaceholder2: 'Team 2',
};
