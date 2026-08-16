// lib/i18n/locales/fr/liveSegmentBlock.ts
//
// Traductions FRANCAISES du namespace `liveSegmentBlock` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('liveSegmentBlock', {
  statusUpcoming: 'À venir',
  statusLive: 'EN DIRECT',
  statusDone: 'Terminé',
  statusSkipped: 'Passé',
  typeMatch: 'Match',
  typeBreak: 'Pause',
  typeIntro: 'Intro',
  typeOutro: 'Outro',
  typeCustom: 'Segment',
  startsNow: 'Démarre maintenant',
  startsIn: 'Démarre dans',
  noEventTitle: "Pas d'event en cours",
  noEventBody:
    "Aucun event_run n'est actuellement en direct sur ce tenant. Tes prochaines assignations s'affichent ci-dessous.",
  liveBadge: 'En direct',
  waitingNextSegment: 'En attente du prochain segment',
  nextLabel: 'Prochain :',
  minSuffix: ' • {min} min',
  timerRemaining: 'Restant',
  timerOverrun: 'Dépassement',
  timerNoDuration: 'Sans durée définie',
  elapsed: 'Écoulé',
  nextShort: 'Suivant :',
  segmentFallback: 'Segment',
});
