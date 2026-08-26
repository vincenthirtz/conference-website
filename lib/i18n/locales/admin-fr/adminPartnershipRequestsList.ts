// lib/i18n/locales/admin-fr/adminPartnershipRequestsList.ts
//
// Traductions FRANCAISES du namespace `adminPartnershipRequestsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminPartnershipRequestsList', {
  statusNew: 'Nouvelle',
  statusRead: 'Lue',
  statusContacted: 'Contacté',
  statusNegotiating: 'En négociation',
  statusAccepted: 'Acceptée',
  statusDeclined: 'Déclinée',
  statusArchived: 'Archivée',
  categorySuper: 'Super partenaire',
  categoryMajor: 'Partenaire majeur',
  categoryCultural: 'Partenaire culturel',
  categoryOther: 'Autre',
  confirmDeleteTitle: 'Supprimer cette demande ?',
  delete: 'Supprimer',
  errorDelete: 'Erreur de suppression.',
  pageTitle: 'Admin - Demandes de partenariat',
  heading: 'Demandes de partenariat',
  countRequests_one: '{count} demande',
  countRequests_other: '{count} demandes',
  newCount_one: '{count} nouvelle',
  newCount_other: '{count} nouvelles',
  managePartners: 'Gérer les partenaires',
  filterStatus: 'Statut',
  statusAll: 'Tous les statuts',
  filterCategory: 'Catégorie',
  categoryAll: 'Toutes les catégories',
  filterSearch: 'Recherche',
  searchPlaceholder: 'Entreprise, contact, email...',
  empty: 'Aucune demande trouvée',
  receivedOn: 'Reçue le {date}',
  budget: 'Budget: {budget}',
  view: 'Voir',
  previous: 'Précédent',
  next: 'Suivant',
  paginationTotal: ' sur {total}',
});
