// lib/i18n/locales/en/announcementsTicker.ts
//
// Traductions ANGLAISES du namespace `announcementsTicker`.
//
// La SOURCE DE VERITE est le francais (`../fr/announcementsTicker.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  discover: 'Discover',
  goToAnnouncement: 'Go to announcement {n}',
};
