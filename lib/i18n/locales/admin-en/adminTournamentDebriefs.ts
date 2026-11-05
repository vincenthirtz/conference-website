// lib/i18n/locales/admin-en/adminTournamentDebriefs.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentDebriefs`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentDebriefs.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Team debriefs',
  intro:
    'When the tournament is over, the bot asks each team for its positives and negatives, in its private Discord channel. Answers can only be read here, by staff.',
  autoNote:
    'The request goes out on its own when the podium is frozen. Use this button for a tournament closed without finalization, or to remind the teams.',
  requestCta: 'Request the debrief',
  requesting: 'Sending…',
  refresh: 'Refresh',
  noTeamsToRequest: 'No team entered: there is nobody to ask for a debrief.',
  confirmTitle: 'Request the debrief?',
  confirmSubtitle:
    'The bot will ask for a debrief in the private channel of every entered team.',
  confirmAnswered_one:
    '{count} team has already answered: it will get the message too and can edit its debrief.',
  confirmAnswered_other:
    '{count} teams have already answered: they will get the message too and can edit their debrief.',
  confirmLabel: 'Send the request',
  resultSent_one: 'Sent to {requested} team.',
  resultSent_other: 'Sent to {requested} teams.',
  resultSentWithout_one:
    'Sent to {requested} team, {without} of them without a Discord channel.',
  resultSentWithout_other:
    'Sent to {requested} teams, {without} of them without a Discord channel.',
  resultWithoutHint:
    'A team without a private channel does not get the message: reach it another way.',
  resultNone: 'No team entered: nothing was sent.',
  requestError: 'The debrief request could not be sent.',
  loading: 'Loading debriefs…',
  loadError: 'Could not load the debriefs.',
  retry: 'Retry',
  emptyTitle: 'No team entered',
  emptyDescription:
    'Debriefs will show up here as soon as teams entered in the tournament answer the bot.',
  answeredCount: 'Answers: {answered} of {total}',
  listLabel: 'Debriefs by team',
  noAnswer: 'No answer yet',
  updatedAt: 'Updated on {date}',
  positives: 'Positives',
  negatives: 'Negatives',
  nothingNoted: 'Nothing noted',
};
