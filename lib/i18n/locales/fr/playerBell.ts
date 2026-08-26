// lib/i18n/locales/fr/playerBell.ts
//
// Traductions FRANCAISES du namespace `playerBell` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerBell', {
  title: 'Notifications',
  empty: 'Aucune notification',
  ariaLabel: 'Mon espace joueur — {tooltip}',
  checkinPending: 'check-in à valider',
  messages_one: '{count} message',
  messages_other: '{count} messages',
  scrims_one: '{count} scrim',
  scrims_other: '{count} scrims',
  candidatures_one: '{count} candidature',
  candidatures_other: '{count} candidatures',
});
