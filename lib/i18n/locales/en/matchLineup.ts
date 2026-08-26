// lib/i18n/locales/en/matchLineup.ts
//
// Traductions ANGLAISES du namespace `matchLineup`.
//
// La SOURCE DE VERITE est le francais (`../fr/matchLineup.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Match sheet',
  intro:
    'Tick the players fielded for this match. This list is what counts for the rankings and in case of a dispute — not the roster on the day the score is entered.',
  introValidated: 'Line-up declared for this match.',
  badgeTeam: 'Validated by the team',
  badgeAdmin: 'Validated by staff',
  validatedAt: 'Validated on {date}.',
  substituteBadge: 'Substitute',
  unknownMember: 'Member',
  goCheckin: 'Check in now',
  save: 'Save',
  validate: 'Validate the sheet',
  validateHint:
    'Once validated the sheet is frozen: only tournament staff can reopen it.',
};
