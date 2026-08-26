// lib/i18n/locales/admin-fr/adminCastMembersList.ts
//
// Traductions FRANCAISES du namespace `adminCastMembersList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCastMembersList', {
  pageTitle: 'Admin – Casteuses',
  heading: 'Pôle Production & Cast',
  count_one: '{count} casteuse configurée',
  count_other: '{count} casteuses configurées',
  loading: 'Chargement…',
  addButton: 'Ajouter une casteuse',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Nom, titre ou ville...',
  statusLabel: 'Statut',
  statusAll: 'Toutes',
  statusActivePlural: 'Actives',
  statusInactivePlural: 'Inactives',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  emptyFiltered: 'Aucune casteuse trouvée',
  emptyState: 'Aucune casteuse configurée',
  savingOrder: "Sauvegarde de l'ordre…",
  promo: 'Promo',
  order: 'Ordre',
  deactivate: 'Désactiver',
  activate: 'Activer',
  edit: 'Modifier',
  delete: 'Supprimer',
  previous: 'Précédent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
  deleteConfirmTitle: 'Supprimer cette casteuse ?',
  reorderFailed_one: 'Échec de {failed} mise à jour sur {total}',
  reorderFailed_other: 'Échec de {failed} mises à jour sur {total}',
  errorReorder: "Erreur lors de la sauvegarde de l'ordre.",
  errorDeleteFailed: 'Suppression impossible',
  errorDelete: 'Erreur de suppression.',
  errorUpdateFailed: 'Modification impossible',
  errorUpdate: 'Erreur de modification.',
});
