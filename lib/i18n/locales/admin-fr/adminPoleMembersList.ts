// lib/i18n/locales/admin-fr/adminPoleMembersList.ts
//
// Traductions FRANCAISES du namespace `adminPoleMembersList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPoleMembersList', {
  pageTitle: "Admin – Pôles de l'asso",
  heading: "Pôles de l'association",
  summary_one: '{count} membre au total — répartis sur {poles} pôles.',
  summary_other: '{count} membres au total — répartis sur {poles} pôles.',
  addButton: 'Ajouter un membre',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Nom ou rôle...',
  poleLabel: 'Pôle',
  poleAll: 'Tous les pôles',
  memberCount_one: '{count} membre',
  memberCount_other: '{count} membres',
  emptyPole: 'Aucun membre dans ce pôle.',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  order: 'Ordre',
  deactivate: 'Désactiver',
  activate: 'Activer',
  edit: 'Modifier',
  delete: 'Supprimer',
  deleteConfirmTitle: 'Supprimer ce membre du pôle ?',
  errorDeleteFailed: 'Suppression impossible',
  errorDelete: 'Erreur de suppression.',
  errorUpdateFailed: 'Modification impossible',
  errorUpdate: 'Erreur de modification.',
});
