// lib/i18n/locales/fr/scrimDetail.ts
//
// Traductions FRANCAISES du namespace `scrimDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('scrimDetail', {
  backToScrims: '← Tous les scrims',
  about: 'À propos',
  viewStream: 'Voir le stream →',
  matchesHeading: 'Matchs ({count})',
  noMatches: 'Programme des matchs à venir.',
  matchNumber: 'Match #{n}',
  vs: 'vs',
  tbd: 'à définir',
  dateTbd: 'Date à définir',
});
