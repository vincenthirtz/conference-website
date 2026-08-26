// lib/i18n/locales/fr/urgentCueModal.ts
//
// Traductions FRANCAISES du namespace `urgentCueModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('urgentCueModal', {
  ackFailed: "Échec de l'ack, réessayer.",
  urgent: 'URGENT',
  directorCue: 'Consigne Director',
  sending: 'Envoi…',
  retry: 'Réessayer',
  seen: 'Vu',
  seenOffline: 'Vu (hors ligne)',
  offlineHint:
    "Réseau injoignable. « Vu (hors ligne) » enregistre ta confirmation et l'envoie dès le retour du réseau.",
});
