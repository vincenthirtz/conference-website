// lib/i18n/locales/admin-fr/adminDirectorCueComposer.ts
//
// Traductions FRANCAISES du namespace `adminDirectorCueComposer` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorCueComposer', {
  cueUrgentSent: "Cue urgent envoye. En attente d'ack.",
  cueSent: 'Cue envoye.',
  sendFailed: 'Envoi echoue.',
  severityAria: 'Severite du cue',
  severityItemAria: 'Severite {label}',
  cueTextLabel: 'Texte du cue',
  placeholderLive: 'Ex : on coupe la pub dans 30s, on reprend match 2',
  placeholderIdle: 'Le run doit etre live pour envoyer un cue.',
  keyMac: '⌘ + Entree',
  keyOther: 'Ctrl + Entree',
  toSend: 'pour envoyer',
  sendAria: 'Envoyer le cue',
  sending: 'Envoi…',
  send: 'Envoyer',
  ackNote: 'Ack requis — les casters devront cliquer Vu.',
  startNote: 'Demarre le run pour envoyer des cues.',
});
