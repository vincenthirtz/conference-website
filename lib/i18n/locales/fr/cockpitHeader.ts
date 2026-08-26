// lib/i18n/locales/fr/cockpitHeader.ts
//
// Traductions FRANCAISES du namespace `cockpitHeader` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('cockpitHeader', {
  roleFallback: 'Caster',
  install: 'Installer',
  quit: 'Quitter',
  statusOnline: 'En ligne',
  statusSeen: 'Vu par la régie',
  statusReconnecting: 'Reconnexion…',
  statusOffline: 'Hors ligne',
});
