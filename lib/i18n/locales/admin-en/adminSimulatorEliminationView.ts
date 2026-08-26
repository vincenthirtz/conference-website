// lib/i18n/locales/admin-en/adminSimulatorEliminationView.ts
//
// Traductions ANGLAISES du namespace admin `adminSimulatorEliminationView`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminSimulatorEliminationView.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  match_one: '{count} match',
  match_other: '{count} matches',
};
