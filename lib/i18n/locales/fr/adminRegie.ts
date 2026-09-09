// lib/i18n/locales/fr/adminRegie.ts
//
// Traductions FRANCAISES du namespace `adminRegie` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
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
  obsTitle: 'Scène OBS',
  obsDesc:
    "La scène liée passe à l'antenne au démarrage du segment. Sans lien, la régie ne touche pas à OBS.",
  obsDisconnected: 'OBS non connecté',
  obsConnecting: 'Connexion à OBS…',
  obsConnected: 'OBS connecté',
  obsConnect: 'Connecter OBS',
  obsConnectHint:
    'Réglages repris du cockpit caster (hôte, port, mot de passe).',
  obsConnectError: 'Connexion à OBS impossible : {message}',
  obsSceneLabel: 'Scène liée à « {segment} »',
  obsSceneNone: 'Aucune (ne pas toucher à OBS)',
  obsSaving: 'Enregistrement…',
  obsSaveError: 'Impossible de lier la scène : {message}',
  obsSwitched: 'OBS basculé sur « {scene} ».',
  obsSwitchError:
    'Bascule OBS vers « {scene} » impossible : {message}. Le segment continue.',
  obsSceneMissing:
    "« {scene} » n'existe plus dans OBS — la scène a-t-elle été renommée ?",
  obsNoSegment: 'Aucun segment à lier.',
});
