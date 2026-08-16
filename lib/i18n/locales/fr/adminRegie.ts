// lib/i18n/locales/fr/adminRegie.ts
//
// Traductions FRANCAISES du namespace `adminRegie` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('adminRegie', {
  docTitle: "Régie | OW Women's Cup",
  heading: 'Régie',
  subtitle:
    'Pupitre régie en temps réel : segment en cours, cues, briefings et checklist.',
  openDirector: 'Ouvrir le Director',
  signOut: 'Se déconnecter',
  statusOnline: 'En ligne',
  statusReconnecting: 'Reconnexion…',
  statusOffline: 'Hors ligne',
  statusSeen: 'Vu par la régie',
  endRun: 'Terminer le run',
  ending: 'Fin en cours…',
  endRunConfirmTitle: 'Terminer le run en cours ?',
  endRunConfirmBody: 'Tous les segments non terminés passeront à « terminé ».',
  endRunConfirmCta: 'Terminer le run',
  endRunSuccess: 'Run terminé.',
  endRunError: 'Impossible de terminer le run.',
  endSegment: 'Terminer le segment',
  endingSegment: 'Fin du segment…',
  endSegmentConfirmTitle: 'Terminer le segment en cours ?',
  endSegmentConfirmBody:
    'Le segment passera à « terminé ». Le pupitre attendra le prochain segment.',
  endSegmentConfirmCta: 'Terminer le segment',
  endSegmentSuccess: 'Segment terminé.',
  endSegmentError: 'Impossible de terminer le segment.',
  startNext: 'Démarrer le prochain',
  startingNext: 'Démarrage…',
  startNextSuccess: 'Segment suivant démarré.',
  startNextError: 'Impossible de démarrer le segment suivant.',
});
