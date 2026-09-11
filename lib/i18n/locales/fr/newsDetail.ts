// lib/i18n/locales/fr/newsDetail.ts
//
// Traductions FRANCAISES du namespace `newsDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('newsDetail', {
  backHome: "← Retour à l'accueil",
  newsLabel: 'News',
  seoDescriptionFallback: 'Actualité {site} : {title}',
  noContent: 'Pas de contenu pour cette news.',
  rssFeed: 'Flux RSS',
  shareTitle: 'Partager cet article',
  shareBluesky: 'Bluesky',
  shareX: 'X',
  shareFacebook: 'Facebook',
  shareCopy: 'Copier le lien',
  shareCopied: 'Lien copié',
  allNews: 'Toutes les actualités',
  relatedTitle: 'À lire aussi',
  commentsTitle: 'Commentaires',
  commentContentSrLabel: 'Votre commentaire',
  commentPlaceholder: 'Partage ton avis...',
  commentAuthorSrLabel: 'Nom (optionnel)',
  authorPlaceholder: 'Nom (optionnel)',
  captchaSrLabel: 'Question anti-spam : combien font {question} ?',
  captchaSrLabelFallback: 'Question anti-spam',
  captchaPlaceholder: 'Combien font {question} ?',
  captchaLoading: 'Chargement...',
  submitting: 'Envoi...',
  publish: 'Publier',
  emptyComments: 'Aucun commentaire pour le moment.',
  commentsLoading: 'Chargement des commentaires…',
  retryComments: 'Réessayer',
  anonymous: 'Anonyme',
  errFetchComments: 'Impossible de récupérer les commentaires.',
  errTooShort: 'Le commentaire doit contenir au moins 3 caractères.',
  errPublish: 'Impossible de publier le commentaire',
  errPublishGeneric: 'Erreur lors de la publication',
  published: 'Commentaire publié.',
});
