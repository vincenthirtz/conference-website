// lib/i18n/locales/fr/draftSpectator.ts
//
// Traductions FRANCAISES du namespace `draftSpectator` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('draftSpectator', {
  sideBlue: 'BLUE SIDE',
  sideRed: 'RED SIDE',
  sideRadiant: 'RADIANT',
  sideDire: 'DIRE',
  pickLabel: 'Pick #{num}',
  autoSuffix: ' · AUTO',
  bans: 'Bans',
  banned: '{name} (banni)',
  awaitingBan: 'Ban #{num} en attente',
  draftNotStarted: 'Draft pas encore commencée',
  gameShort: 'Game',
  fearlessSuffix: ' · FEARLESS',
  draftTitle: 'Draft MOBA',
  step: 'Étape',
});
