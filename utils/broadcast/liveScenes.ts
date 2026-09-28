// utils/broadcast/liveScenes.ts
//
// Les scènes de l'overlay de run (`broadcast_state.scene`), dans l'ordre des
// boutons de la console live — et donc des raccourcis Maj+1…6.
//
// Une seule liste pour la page et ses raccourcis : un ordre recopié dans
// deux fichiers finit par ne plus correspondre, et Maj+3 lancerait une autre
// scène que le troisième bouton.

export type LiveScene =
  | 'starting'
  | 'match'
  | 'pause'
  | 'results'
  | 'end'
  | 'custom';

export const LIVE_SCENES: readonly LiveScene[] = [
  'starting',
  'match',
  'pause',
  'results',
  'end',
  'custom',
];
