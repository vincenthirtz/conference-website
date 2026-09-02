// lib/i18n/locales/fr/newsTags.ts
//
// Libellés FRANÇAIS des familles de tags d'actualité — SOURCE DE VÉRITÉ.
// Les slugs bruts vivent en base (`news.tag`) ; leur regroupement en familles
// est dans `utils/news/newsTag.ts`. Ici, seulement ce qui s'affiche.

import { ns } from '../../ns';

export default ns('newsTags', {
  announcements: 'Annonces',
  tournaments: 'Tournois',
  teams: 'Équipes',
  events: 'Évènements',
  updates: 'Mises à jour',
  general: 'Général',
});
