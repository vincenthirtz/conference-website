// lib/i18n/locales/en/profileSummary.ts
//
// Traductions ANGLAISES du namespace `profileSummary`.
//
// La SOURCE DE VERITE est le francais (`../fr/profileSummary.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'My profile',
  manage: 'Manage my profile',
  email: 'Email',
  displayName: 'Display name',
  role: 'Role',
  battleTag: 'BattleTag',
};
