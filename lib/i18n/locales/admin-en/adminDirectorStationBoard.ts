// lib/i18n/locales/admin-en/adminDirectorStationBoard.ts
//
// Traductions ANGLAISES du namespace admin `adminDirectorStationBoard`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDirectorStationBoard.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  nameRequired: 'The name is required.',
  subtitle: 'Production stations (stream / caster).',
  cancel: 'Cancel',
  addStation: '+ Station',
  namePlaceholder: 'Station name (e.g. Main stream)',
  streamPlaceholder: 'Stream URL (optional)',
  notesPlaceholder: 'Notes (optional)',
  createStation: 'Create station',
  empty: 'No station. Create one to attach segments to a station.',
  statusTitle: 'Change status',
  streamLink: 'Stream ↗',
  liveNow: 'Live: {title}',
  noLive: 'No live segment.',
  close: 'Close',
  edit: 'Edit',
  delete: 'Delete',
  editNamePlaceholder: 'Name',
  editStreamPlaceholder: 'Stream URL',
  editNotesPlaceholder: 'Notes',
  save: 'Save',
};
