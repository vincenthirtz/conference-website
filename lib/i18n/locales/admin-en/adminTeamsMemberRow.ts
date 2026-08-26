// lib/i18n/locales/admin-en/adminTeamsMemberRow.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamsMemberRow`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamsMemberRow.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  memberFallback: 'Member',
  captain: 'Captain',
  substitute: 'Substitute',
  swapWithSubTitle: 'Swap with a substitute',
  swapWithRosterTitle: 'Swap with a roster player',
  setCaptainTitle: 'Set as captain',
  editTitle: 'Edit',
  deleteTitle: 'Delete',
  clickToSwap: 'Click to swap',
  battleTagVerified: '✓ verified',
  battleTagUnverified: 'unverified',
  battleTagVerifiedTitle: 'BattleTag verified via Battle.net on {date}',
  battleTagUnverifiedTitle: 'BattleTag not verified through Battle.net OAuth',
  battleTagMismatch: '⚠ verified account ≠ roster tag',
  battleTagMismatchTitle:
    "The player's verified Blizzard account does not match the roster BattleTag (potential impersonation or typo to investigate).",
};
