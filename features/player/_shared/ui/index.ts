// features/player/_shared/ui — les archétypes joueuse, mobile d'abord (lot P8,
// docs/PLAN-industrialisation-joueur.md § « Le Ruban » sur une surface player).
//
// Des COMPOSITIONS de briques du kit unique `features/ruban` — jamais des
// briques : la garde « iso » (tests/unit/playerBoundariesGuard.test.ts)
// refuse un bouton / une puce / une carte / un en-tête défini ici.
// Aperçu : /dev/player-kit.

export { default as ActionDock } from './ActionDock';
export {
  default as CollectionView,
  type CollectionLabels,
} from './CollectionView';
export { default as FicheView, FicheFold } from './FicheView';
export { default as FilView } from './FilView';
export { default as ListeView, ListeRow, type ListeLabels } from './ListeView';
export { default as ParcoursView, type ParcoursStep } from './ParcoursView';
