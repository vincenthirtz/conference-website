// lib/i18n/locales/admin-en/adminDashboardSparkline.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardSparkline`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardSparkline.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  cadenceAria: 'Cadence: {total} over {hours}h',
};
