// lib/i18n/locales/admin-fr/adminPartnersList.ts
//
// Traductions FRANCAISES du namespace `adminPartnersList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPartnersList', {
  pageTitle: 'Admin - Partenaires',
  heading: 'Gestion des partenaires',
  count_one: '{count} partenaire',
  count_other: '{count} partenaires',
  loading: 'Chargement...',
  newButton: 'Nouveau partenaire',
  categoryLabel: 'Catégorie',
  categoryAll: 'Toutes les catégories',
  categorySuper: 'Super partenaire',
  categoryMajor: 'Partenaire majeur',
  categoryCultural: 'Partenaire culturel',
  statusLabel: 'Statut',
  statusAll: 'Tous les statuts',
  statusActive: 'Actifs',
  statusInactive: 'Inactif',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Nom du partenaire...',
  emptyState: 'Aucun partenaire trouvé',
  order: 'Ordre: {order}',
  website: 'Site web',
  deactivate: 'Désactiver',
  activate: 'Activer',
  edit: 'Modifier',
  delete: 'Supprimer',
  previous: 'Precedent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
  deleteConfirmTitle: 'Supprimer ce partenaire ?',
  errorLoad: 'Impossible de charger les partenaires.',
  errorDelete: 'Erreur de suppression.',
  errorUpdate: 'Erreur de modification.',
});
