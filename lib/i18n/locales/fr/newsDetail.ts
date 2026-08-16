// lib/i18n/locales/fr/newsDetail.ts
//
// Traductions FRANCAISES du namespace `newsDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('newsDetail', {
  backHome: "← Retour à l'accueil",
  newsLabel: 'News',
  noContent: 'Pas de contenu pour cette news.',
  rssFeed: 'Flux RSS',
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
  anonymous: 'Anonyme',
  errFetchComments: 'Impossible de récupérer les commentaires',
  errLoadComments: 'Erreur chargement commentaires',
  errTooShort: 'Le commentaire doit contenir au moins 3 caractères.',
  errPublish: 'Impossible de publier le commentaire',
  errPublishGeneric: 'Erreur lors de la publication',
  published: 'Commentaire publié.',
});
