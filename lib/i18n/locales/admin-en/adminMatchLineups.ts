// lib/i18n/locales/admin-en/adminMatchLineups.ts
//
// Traductions ANGLAISES du namespace admin `adminMatchLineups`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminMatchLineups.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Match sheets',
  unknownTeam: 'Unknown team',
  badgeTeam: 'Validated by the team',
  badgeAdmin: 'Validated by staff',
  badgeDraft: 'Draft',
  awaitingCheckin: 'Waiting for the team check-in.',
  closed: 'Sheet closed for this match.',
  noPlayers: 'No player declared.',
  substitute: '(substitute)',
  validatedAt: 'Validated on {date}.',
  validateForTeam: 'Validate on their behalf',
  reopen: 'Reopen',
  footnote:
    'Validating on a team behalf marks the sheet "validated by staff": it does not commit the team the same way. Reopening is the only action that unfreezes a validated sheet.',
};
