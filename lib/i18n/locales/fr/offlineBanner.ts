// lib/i18n/locales/fr/offlineBanner.ts
//
// Traductions FRANCAISES du namespace `offlineBanner` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('offlineBanner', {
  offlineTitle: 'Hors ligne',
  queued_one: '{count} action en file — rejouée dès la reconnexion.',
  queued_other: '{count} actions en file — rejouées dès la reconnexion.',
  queueEmpty: 'Tes actions critiques seront mises en file.',
  syncTitle: 'Synchronisation',
  sending_one: "{count} action en cours d'envoi…",
  sending_other: "{count} actions en cours d'envoi…",
});
