// lib/i18n/locales/fr/lorePage.ts
//
// Traductions FRANCAISES du namespace `lorePage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('lorePage', {
  headTitle: 'Lore & Médias Overwatch | OW World Cup',
  headDesc:
    "Découvrez l'univers d'Overwatch : bandes dessinées, nouvelles, musiques et images officielles de Blizzard.",
  eyebrow: 'Univers & Lore',
  title: 'Médias Overwatch',
  intro:
    "Plongez dans l'univers d'Overwatch avec les bandes dessinées, nouvelles, musiques et visuels officiels de Blizzard.",
  labelComic: 'Bande dessinée',
  labelStory: 'Nouvelle',
  labelMusic: 'Musique',
  labelScreenshot: 'Image',
  tabAll: 'Tout',
  tabComic: 'BD',
  tabStory: 'Nouvelles',
  tabMusic: 'Musique',
  tabScreenshot: 'Images',
  partsCount: '{count} parties',
  ctaComic: 'Lire la BD',
  ctaStory: 'Lire la nouvelle',
  ctaMusic: 'Écouter',
  ctaScreenshot: 'Voir les images',
  empty: 'Aucun média disponible pour le moment.',
  viewAllBlizzard: 'Voir tous les médias sur Blizzard',
});
