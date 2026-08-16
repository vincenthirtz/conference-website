// lib/i18n/locales/admin-fr/adminCommentsList.ts
//
// Traductions FRANCAISES du namespace `adminCommentsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCommentsList', {
  pageTitle: 'Admin – Commentaires',
  heading: 'Commentaires',
  count_one: '{count} commentaire',
  count_other: '{count} commentaires',
  loading: 'Chargement...',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Contenu ou auteur...',
  searchButton: 'Rechercher',
  emptyState: 'Aucun commentaire trouvé',
  anonymous: 'Anonyme',
  articleFallback: 'Article',
  saving: 'Enregistrement...',
  save: 'Sauvegarder',
  cancel: 'Annuler',
  delete: 'Supprimer',
  deleting: 'Suppression...',
  previous: 'Précédent',
  next: 'Suivant',
  paginationOf: ' sur {total}',
  deleteModalTitle: 'Supprimer le commentaire ?',
  deleteModalSubtitle: 'Cette action est irréversible',
  byAuthor: 'Par {author}',
  toastDeleted: 'Commentaire supprimé',
  toastUpdated: 'Commentaire mis à jour',
  errorDelete: 'Erreur lors de la suppression',
  errorUpdate: 'Erreur lors de la mise à jour',
});
