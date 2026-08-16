// lib/i18n/locales/admin-fr/adminDirectorWaveBoard.ts
//
// Traductions FRANCAISES du namespace `adminDirectorWaveBoard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorWaveBoard', {
  titleRequired: 'Le titre est obligatoire.',
  durationPositive: 'La duree doit etre un entier positif.',
  subtitle: 'Regroupements de segments (poules, finale…).',
  cancel: 'Annuler',
  addWave: '+ Wave',
  titlePlaceholder: 'Titre de la wave',
  startLabel: 'Debut prevu',
  durationLabel: 'Duree (min)',
  durationPlaceholder: 'ex: 90',
  createWave: 'Creer la wave',
  empty: 'Aucune wave. Cree-en une pour regrouper des segments.',
  upAria: 'Monter',
  downAria: 'Descendre',
  segCountTitle: 'Segments rattaches',
  segment_one: '{count} segment',
  segment_other: '{count} segments',
  start: 'Demarrer',
  skip: 'Skip',
  end: 'Terminer',
  close: 'Fermer',
  edit: 'Editer',
  delete: 'Supprimer',
  editTitlePlaceholder: 'Titre',
  editDurationPlaceholder: 'Duree (min)',
  save: 'Enregistrer',
});
