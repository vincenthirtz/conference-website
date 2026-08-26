// lib/i18n/locales/admin-fr/adminDirectorStationBoard.ts
//
// Traductions FRANCAISES du namespace `adminDirectorStationBoard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorStationBoard', {
  nameRequired: 'Le nom est obligatoire.',
  subtitle: 'Postes de production (stream / caster).',
  cancel: 'Annuler',
  addStation: '+ Station',
  namePlaceholder: 'Nom de la station (ex: Stream principal)',
  streamPlaceholder: 'URL du stream (optionnel)',
  notesPlaceholder: 'Notes (optionnel)',
  createStation: 'Creer la station',
  empty: 'Aucune station. Cree-en une pour rattacher des segments a un poste.',
  statusTitle: 'Changer le statut',
  streamLink: 'Stream ↗',
  liveNow: 'En direct : {title}',
  noLive: 'Aucun segment en direct.',
  close: 'Fermer',
  edit: 'Editer',
  delete: 'Supprimer',
  editNamePlaceholder: 'Nom',
  editStreamPlaceholder: 'URL du stream',
  editNotesPlaceholder: 'Notes',
  save: 'Enregistrer',
});
