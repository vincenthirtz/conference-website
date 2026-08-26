// lib/i18n/locales/admin-en/adminDirectorTimelineBuilder.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorTimelineBuilder`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorTimelineBuilder.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  emptyTitle: 'No segments.',
  emptyDescription: 'Add a first segment to start structuring your run.',
  addSegment: 'Add a segment',
  addSegmentPlus: '+ Add a segment',
};
