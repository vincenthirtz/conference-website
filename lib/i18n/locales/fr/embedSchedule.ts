// lib/i18n/locales/fr/embedSchedule.ts
//
// Traductions FRANCAISES du namespace `embedSchedule` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('embedSchedule', {
  title: 'Calendrier',
  empty: 'Aucun match programmé pour ce tournoi.',
  viewOn: 'Voir sur {site}',
  vs: 'vs',
  tbd: 'À déterminer',
  statusUpcoming: 'À venir',
  statusLive: 'En direct',
  statusDone: 'Terminé',
});
