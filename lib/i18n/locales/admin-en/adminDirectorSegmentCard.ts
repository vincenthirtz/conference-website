// lib/i18n/locales/admin-en/adminDirectorSegmentCard.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorSegmentCard`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorSegmentCard.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  dragHandleAria: 'Drag to reorder',
  lockedAria: 'Locked segment (live or done) — cannot be moved',
  anchorTitle: 'Anchored schedule',
  computedTitle: 'Computed schedule',
  overrunTitle: 'Overrun of {value}',
  startTitle: 'Start this segment',
  start: 'Start',
  skipTitle: 'Skip this segment',
  skip: 'Skip',
  endTitle: 'End this segment',
  end: 'End',
  deleteTitle: 'Delete this segment',
};
