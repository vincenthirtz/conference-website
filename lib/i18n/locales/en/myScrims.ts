// lib/i18n/locales/en/myScrims.ts
//
// Traductions ANGLAISES du namespace `myScrims`.
//
// La SOURCE DE VERITE est le francais (`../fr/myScrims.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Our scrims',
  toReportLabel: 'To report',
  upcomingLabel: 'Upcoming',
  recentLabel: 'Recent',
  unknownOpponent: 'Unknown opponent',
  noDate: 'Date TBD',
  noScore: 'No score',
  unranked: 'unranked',
  reportCta: 'Report score',
  correctCta: 'Correct my report',
  submitCta: 'Submit',
  usLabel: 'Us',
  themLabel: 'Them',
  reportHint:
    'The scrim closes when both teams report the same score. If they disagree, it goes to dispute.',
  awaitingOpponent: 'Your report is saved — waiting for the opponent.',
  disputed: 'Conflicting reports: needs arbitration.',
  reportCompleted: 'Score confirmed by both teams: scrim closed.',
  reportAwaiting: 'Report saved — waiting for the opponent.',
  reportDisputed: 'Both reports disagree: the scrim goes to dispute.',
  errorScores: 'Enter two valid scores.',
  errorReport: 'The report could not be saved.',
};
