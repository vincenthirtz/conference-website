// lib/i18n/locales/admin-fr/adminAnnouncementsList.ts
//
// Traductions FRANCAISES du namespace `adminAnnouncementsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminAnnouncementsList', {
  pageTitle: 'Admin – Annonces',
  heading: 'Gestion des annonces',
  count_one: '{count} annonce',
  count_other: '{count} annonces',
  loading: 'Chargement...',
  newButton: 'Nouvelle annonce',
  retry: 'Réessayer',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Titre ou message...',
  statusLabel: 'Statut',
  statusAll: 'Tous les statuts',
  statusActive: 'Actif',
  statusInactive: 'Inactif',
  searchButton: 'Rechercher',
  emptyState: 'Aucune annonce trouvée',
  priority: 'Priorité {priority}',
  ctaLabel: 'CTA: {label}',
  startAt: 'Début: {date}',
  endAt: 'Fin: {date}',
  edit: 'Modifier',
  delete: 'Supprimer',
  previous: 'Précédent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
  deleteModalTitle: 'Supprimer cette annonce ?',
  deleteModalPrefix: "Supprimer l'annonce",
  errorLoad: 'Erreur lors du chargement',
  errorDeleteFailed: 'Suppression impossible',
  errorDelete: 'Erreur de suppression.',
});
