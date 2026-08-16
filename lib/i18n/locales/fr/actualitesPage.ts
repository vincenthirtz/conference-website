// lib/i18n/locales/fr/actualitesPage.ts
//
// Traductions FRANCAISES du namespace `actualitesPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('actualitesPage', {
  badgePatch: 'Patch Notes',
  readDetails: 'Lire les détails',
  categoryFallback: 'Actualité',
  readArticle: "Lire l'article",
  headerEyebrow: 'Actualités Blizzard',
  headerTitle: 'Actualités Overwatch',
  headerSubtitle:
    'Patch notes, mises à jour et actualités officielles du jeu, directement depuis Blizzard.',
  siteNewsLink: 'Voir les actualités du site',
  tabAll: 'Tout',
  tabPatch: 'Patch Notes',
  tabNews: 'Actualités',
  loadError:
    'Impossible de charger les actualités Blizzard pour le moment. Réessaie dans quelques instants.',
  empty: 'Aucune actualité disponible pour le moment.',
  allPatchNotes: 'Tous les Patch Notes',
  allNews: 'Toutes les Actualités',
});
