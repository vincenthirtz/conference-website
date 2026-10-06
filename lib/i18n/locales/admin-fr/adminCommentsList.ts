// lib/i18n/locales/admin-fr/adminCommentsList.ts
//
// Traductions FRANCAISES du namespace `adminCommentsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
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
  // Statut et filtre
  filterLabel: 'Statut',
  filterAll: 'Tous',
  filterPending: 'En attente',
  filterVisible: 'Visibles',
  filterHidden: 'Masqués',
  statusVisible: 'Visible',
  statusPending: 'En attente',
  statusHidden: 'Masqué',
  pendingBadge: '{count} en attente',
  // Sélection et actions en masse
  selectComment: 'Sélectionner le commentaire de {author}',
  selectAllPage: 'Tout sélectionner sur la page',
  selectedCount: '{count} sélectionné(s)',
  clearSelection: 'Désélectionner',
  bulkShow: 'Publier la sélection',
  bulkHide: 'Masquer la sélection',
  bulkDelete: 'Supprimer la sélection',
  bulkDeleteTitle: 'Supprimer {count} commentaire(s) ?',
  bulkDeleteBody:
    'Suppression définitive. Pour un retrait réversible, masque plutôt.',
  toastBulkShow: '{count} commentaire(s) publié(s)',
  toastBulkHide: '{count} commentaire(s) masqué(s)',
  toastBulkDelete: '{count} commentaire(s) supprimé(s)',
  errorBulk: 'L’action sur la sélection a échoué',
  statusUnavailable:
    'Statuts indisponibles : la migration news_comments_moderation n’est pas appliquée. Seule la suppression est possible.',
  // Réglages
  settingsHeading: 'Réglages',
  preModerationLabel: 'Pré-modération',
  preModerationHint:
    'Activée, chaque nouveau commentaire attend une validation avant d’être publié. Désactivée, il est publié dès l’envoi.',
  toastPreModerationOn: 'Pré-modération activée',
  toastPreModerationOff: 'Pré-modération désactivée',
  errorSettings: 'Impossible d’enregistrer le réglage',
  closedArticlesHeading: 'Articles aux commentaires fermés',
  closedArticlesEmpty: 'Aucun article fermé.',
  closeArticle: 'Fermer les commentaires',
  reopenArticle: 'Rouvrir',
  toastArticleClosed: 'Commentaires fermés sur « {title} »',
  toastArticleReopened: 'Commentaires rouverts sur « {title} »',
  errorClosure: 'Impossible de modifier l’article',
});
