// lib/i18n/locales/admin-fr/adminDirectorSegmentCard.ts
//
// Traductions FRANCAISES du namespace `adminDirectorSegmentCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorSegmentCard', {
  dragHandleAria: 'Glisser pour reordonner',
  lockedAria: 'Segment verrouillé (en cours ou terminé) — non déplaçable',
  anchorTitle: 'Horaire ancre',
  computedTitle: 'Horaire calcule',
  overrunTitle: 'Depassement de {value}',
  startTitle: 'Demarrer ce segment',
  start: 'Demarrer',
  skipTitle: 'Passer ce segment',
  skip: 'Skip',
  endTitle: 'Terminer ce segment',
  end: 'Terminer',
  deleteTitle: 'Supprimer ce segment',
});
