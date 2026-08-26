// lib/i18n/locales/en/teamDetail.ts
//
// Traductions ANGLAISES du namespace `teamDetail`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamDetail.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  editPage: 'Edit the page',
  active: 'Active',
  statMatches: 'Matches',
  statWins: 'Wins',
  statLosses: 'Losses',
  statMembers: 'Members',
  socialWebsite: 'Website',
  achievementsTitle: 'Achievements',
  sponsorsTitle: 'Sponsors & partners',
  scrimCtaTitle: 'Want to face {name} in a scrim?',
  scrimCtaDesc: 'No account needed — leave a contact, the captain will reply.',
  scrimCtaBtn: 'Propose a scrim',
  rosterLabel: 'Roster',
  rosterCount_one: '{count} starter',
  rosterCount_other: '{count} starters',
  emptyRoster: 'No members shown for this team.',
  substitutesLabel: 'Substitutes',
  staffLabel: 'Staff',
  recentMatchesTitle: 'Recent matches',
  emptyMatches: 'No recent match.',
  tournamentsTitle: 'Tournaments',
  tournamentsCount_one: '{count} tournament',
  tournamentsCount_other: '{count} tournaments',
  emptyTournaments: 'No tournament for now.',
  statisticsTitle: 'Statistics',
  winRateLabel: 'Win rate',
  statDraws: 'Draws',
  activeInLabel: 'Currently competing in:',
  memberFallback: 'Member',
  captainAria: 'Captain',
  substituteBadge: 'Substitute',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  matchVs: 'vs',
  resultWin: 'W',
  resultLoss: 'L',
  resultDraw: 'D',
  statusRunning: 'Ongoing',
  statusUpcoming: 'Upcoming',
  statusFinished: 'Finished',
  statusDraft: 'Draft',
  scrimCtaBtnConnected: 'Propose a scrim',
  networkTitle: 'In the network',
  networkResponseRate: '{rate}% reply rate to proposals',
  networkResponseDelay: 'replies in {hours} h on average',
  networkSample: 'over {count} proposal(s) received',
  networkScrimsTitle: 'Latest scrims',
  networkUnknownOpponent: 'Unknown opponent',
};
