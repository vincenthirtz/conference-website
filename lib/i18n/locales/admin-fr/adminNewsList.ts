// lib/i18n/locales/admin-fr/adminNewsList.ts
//
// Traductions FRANCAISES du namespace `adminNewsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminNewsList', {
  pageTitle: 'Admin – News',
  heading: 'Gestion des news',
  count_one: '{count} article',
  count_other: '{count} articles',
  newButton: 'Nouvelle news',
  retry: 'Réessayer',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Titre ou slug...',
  statusLabel: 'Statut',
  statusAll: 'Tous les statuts',
  statusDraft: 'Brouillon',
  statusPublished: 'Publié',
  searchButton: 'Rechercher',
  emptyState: 'Aucune news trouvée',
  createdOn: 'Créée le {date}',
  publishedOn: 'Publiée le {date}',
  edit: 'Modifier',
  delete: 'Supprimer',
  previous: 'Précédent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
  deleteModalTitle: 'Supprimer cette news ?',
  deleteModalPrefix: "Supprimer l'article",
  errorDelete: 'Erreur de suppression.',
});
