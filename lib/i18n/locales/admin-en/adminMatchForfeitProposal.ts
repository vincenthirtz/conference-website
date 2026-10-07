// lib/i18n/locales/admin-en/adminMatchForfeitProposal.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchForfeitProposal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchForfeitProposal.ts`) :
// toute cle ajoutee la-bas doit l'etre ici avec exactement la meme structure,
// sans quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Proposed forfeit',
  body: '{absent} did not check in before kickoff. The forfeit is NOT applied automatically: confirm or decline it.',
  proposedWinner: 'Winner if confirmed: {winner}',
  proposedAt: 'Proposed on {date}',
  confirm: 'Confirm forfeit',
  decline: 'Decline',
  confirming: 'Applying…',
  declining: 'Declining…',
  confirmTitle: 'Confirm the forfeit of {absent}?',
  confirmMessage:
    'The forfeit score is written, the match becomes a walkover and the bracket moves on. Teams are notified.',
  declineTitle: 'Decline the proposal?',
  declineMessage:
    'Nothing changes on the match. Then enter the score, or apply a manual forfeit if needed.',
  overrideHint: 'Entering a score on this match also dismisses the proposal.',
  unknownTeam: 'Unknown team',
  errorGeneric: 'The decision could not be saved.',
  errorNotPending:
    'This proposal has already been decided (or dismissed by a score entry).',
};
