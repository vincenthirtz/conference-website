// lib/i18n/locales/fr/homeNews.ts
//
// Traductions FRANCAISES du namespace `homeNews` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('homeNews', {
  eyebrow: 'Actualités',
  title: "Dernières news OW Women's Cup",
  subtitle: 'Les annonces officielles du tournoi, publiées par le staff.',
  filterByTag: 'Filtrer par tag',
  filterAll: 'Toutes',
  emptyAll: 'Aucune news pour le moment. Revenez bientôt !',
  emptyCategory: 'Aucune news pour cette catégorie pour le moment.',
  featured: 'À la une',
  comments_one: '{count} commentaire',
  comments_other: '{count} commentaires',
  readArticle: "Lire l'article",
  allNews: 'Toutes les actualités',
  excerptFallback: 'Découvre les dernières informations du tournoi.',
});
