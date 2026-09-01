// lib/i18n/locales/admin-fr/adminStaffPermissions.ts
//
// Traductions FRANCAISES du namespace `adminStaffPermissions` — SOURCE DE
// VERITE. Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou
// de compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStaffPermissions', {
  openCta: 'Permissions',
  title: 'Permissions de {name}',
  intro:
    'Confier une tâche précise sans donner un rôle entier. Les droits cochés ici s’ajoutent à ceux du rôle — ils n’en retirent jamais.',
  roleNote: 'Rôle actuel : {role}. Les droits qu’il couvre sont verrouillés.',
  fromRole: 'Couvert par le rôle — se retire en changeant de rôle.',
  notGrantable: 'Vous ne détenez pas ce droit : vous ne pouvez pas l’accorder.',
  loading: 'Chargement…',
  loadError: 'Les permissions n’ont pas pu être chargées.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Permissions de {name} mises à jour.',
  saveError: 'L’enregistrement a échoué.',
  cancel: 'Annuler',
});
