// lib/i18n/locales/en/briefingPanel.ts
//
// Traductions ANGLAISES du namespace `briefingPanel`.
//
// La SOURCE DE VERITE est le francais (`../fr/briefingPanel.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  matchNotFound: 'Match not found for your tenant.',
  errorWithStatus: 'Error {status}',
  loadError: 'Loading error.',
  briefingLabel: 'Briefing',
  loadingBriefing: 'Loading the briefing...',
  briefingTitle: 'Match briefing',
  noRoster: 'No roster imported',
  teamUnavailable: 'Team unavailable',
  h2hLabel: 'H2H',
  noPreviousMeeting: 'No previous meeting between these teams.',
  meetings_one: '{count} meeting',
  meetings_other: '{count} meetings',
  drawsSuffix: ' • {count} draws',
  recentNews: 'Recent news',
};
