// lib/i18n/locales/fr/newsIndex.ts
//
// Traductions FRANCAISES du namespace `newsIndex` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('newsIndex', {
  readArticle: "Lire l'article",
  headerEyebrow: 'Le blog',
  headerTitle: 'Actualités du site',
  headerSubtitleBefore:
    "Annonces, coulisses et nouvelles de l'OW Women's Cup. Pour les patch notes et l'actu officielle Overwatch, rends-toi sur la page ",
  headerSubtitleLink: 'Actualités Overwatch',
  headerSubtitleAfter: '.',
  loadError:
    'Impossible de charger les actualités pour le moment. Réessaie dans quelques instants.',
  empty: 'Aucune actualité publiée pour le moment. Reviens bientôt !',
  loadMore: "Voir plus d'actualités",
});
