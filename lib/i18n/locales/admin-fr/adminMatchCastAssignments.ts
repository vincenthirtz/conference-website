// lib/i18n/locales/admin-fr/adminMatchCastAssignments.ts
//
// Traductions FRANCAISES du namespace `adminMatchCastAssignments` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminMatchCastAssignments', {
  loadError: 'Impossible de charger les casts assignés',
  chooseError: 'Choisis un caster et une heure de briefing.',
  assigned: 'Caster assigné',
  genericError: 'Échec',
  confirmRemove: 'Retirer ce caster du match ?',
  assignmentDeleted: 'Assignment supprimé',
  rescheduled: 'Briefing repoussé (rappel renvoyé)',
  heading: 'Cast',
  headingDesc:
    'Le bot Discord enverra un DM de rappel à chaque caster ~30 min avant son heure de briefing.',
  loading: 'Chargement…',
  empty: 'Aucun caster assigné.',
  unknownCaster: 'Caster inconnu',
  briefingLabel: 'Briefing : {time}',
  dmSent: 'DM envoyé {time}',
  notLinkedWarning: '⚠️ Caster non lié à un compte → pas de DM possible',
  remove: 'Retirer',
  addLabel: 'Ajouter un caster',
  choosePlaceholder: '— Choisir —',
  notLinkedSuffix: ' (non lié)',
  assign: 'Assigner',
  allAssigned: 'Tous les casters disponibles sont déjà assignés.',
});
