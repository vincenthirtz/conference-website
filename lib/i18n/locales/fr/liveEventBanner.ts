// lib/i18n/locales/fr/liveEventBanner.ts
//
// Traductions FRANCAISES du namespace `liveEventBanner` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('liveEventBanner', {
  ariaLabel: 'Event en direct',
  liveNow: 'En direct maintenant',
  remaining: 'Reste',
  waitingNext: 'En attente du prochain segment —',
  durationMin: '({count} min)',
  programInProgress: 'Programme en cours',
  typeMatch: 'Match',
  typeBreak: 'Pause',
  typeIntro: 'Intro',
  typeOutro: 'Outro',
  typeCustom: 'Segment',
  typeFallback: 'Segment',
});
