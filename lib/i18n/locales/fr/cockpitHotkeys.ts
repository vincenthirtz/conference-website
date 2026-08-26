// lib/i18n/locales/fr/cockpitHotkeys.ts
//
// Traductions FRANCAISES du namespace `cockpitHotkeys` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('cockpitHotkeys', {
  sessionExpired: 'Session expirée, reconnecte-toi.',
  errorWithStatus: 'Erreur {status}',
  toastHighlight: 'Highlight marqué',
  toastScore: 'Score annoncé',
  toastPause: 'Signal pause envoyé',
  triggerFailed: 'Impossible de déclencher la hotkey.',
  scoreLabel: 'Score à annoncer',
  scorePlaceholder: 'ex : 2-1 fin Game 3',
  validate: 'Valider',
  cancel: 'Annuler',
  title: 'Hotkeys',
  sending: 'Envoi...',
  markHighlight: 'Marquer un highlight',
  announceScore: 'Annoncer un score',
  pause: 'Pause',
  disabledHint: 'Hotkeys disponibles uniquement quand un segment est en cours.',
});
