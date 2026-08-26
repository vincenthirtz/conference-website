// lib/i18n/locales/admin-fr/adminDirectorSegmentEditor.ts
//
// Traductions FRANCAISES du namespace `adminDirectorSegmentEditor` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorSegmentEditor', {
  assignFailed: 'Assignation echouee.',
  titleRequired: 'Le titre est obligatoire.',
  durationPositive: 'La duree doit etre un entier positif (en minutes).',
  anchorNoDate: "Impossible d'ancrer : la date du run est introuvable.",
  anchorInvalid: "Heure d'ancrage invalide. Format attendu : HH:MM.",
  checklistIncomplete:
    'Chaque element de checklist doit avoir une cle et un libelle.',
  checklistDuplicate: 'Cle de checklist en doublon : "{key}".',
  saveFailed: 'Sauvegarde echouee.',
  selectPrompt: "Selectionne un segment dans la timeline pour l'editer.",
  heading: 'Editer le segment',
  typeOrd: 'Type : {type} · ord {ord}',
  saving: 'Sauvegarde…',
  save: 'Enregistrer',
  scheduleHeading: 'Horaire',
  anchored: 'Ancre',
  autoComputed: 'Auto (calcule)',
  release: 'Liberer',
  computedHelp: "L'horaire est calcule depuis les segments precedents.",
  anchorAction: 'Ancrer cet horaire',
  assignHeading: 'Assignation',
  waveLabel: 'Wave',
  stationLabel: 'Station',
  none: '— aucune',
  titleLabel: 'Titre',
  durationLabel: 'Duree prevue (minutes)',
  durationPlaceholder: 'ex: 30',
  linkedMatch: 'Match lie :',
  linkedMatchHint: '(le match_id se definit a la creation du segment.)',
  broadcastHeading: 'Message diffuse',
  discordLabel: 'Discord (texte)',
  discordPlaceholder: 'Le segment X demarre maintenant !',
  addItem: '+ Ajouter',
  emptyChecklist:
    'Aucun item de checklist. Le caster ne verra rien a cocher pour ce segment.',
  labelPlaceholder: 'Libelle visible par le caster',
  deleteAria: 'Supprimer',
});
