// lib/i18n/locales/en/checkinToken.ts
//
// Traductions ANGLAISES du namespace `checkinToken`.
//
// La SOURCE DE VERITE est le francais (`../fr/checkinToken.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Match check-in',
  subtitle: "Confirm your team's presence.",
  invalidLinkTitle: 'Invalid link',
  invalidLinkHint:
    'If you think this is a mistake, contact the organizer on Discord.',
  rowTournament: 'Tournament',
  rowYourTeam: 'Your team',
  rowOpponent: 'Opponent',
  rowStart: 'Scheduled start',
  confirmedTitle: 'Check-in confirmed',
  confirmedBody: 'Your team is expected at match time. Good luck!',
  closedTitle: 'Check-in closed',
  closedBody: 'The match has already been processed (status : {status}).',
  saving: 'Saving...',
  confirmBtn: 'Confirm presence',
  forfeitNote:
    'Without check-in before the match starts, your team will be declared forfeit automatically.',
  footer: "OW Women's Cup — Check-in",
  errInvalidLink: 'Invalid link',
  errNetwork: 'Network error',
  errCheckinFailed: 'Check-in failed',
};
