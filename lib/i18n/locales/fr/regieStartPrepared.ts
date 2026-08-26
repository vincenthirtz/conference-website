// lib/i18n/locales/fr/regieStartPrepared.ts
//
// Traductions FRANCAISES du namespace `regieStartPrepared` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('regieStartPrepared', {
  title: 'Démarrer un run préparé',
  description:
    'Lance un run déjà construit avec ses segments, sans repartir de zéro.',
  directorHint:
    'Les segments d’un run se montent et s’éditent dans le Director.',
  loading: 'Chargement des runs préparés…',
  loadError: 'Impossible de charger les runs préparés.',
  noSchedule: 'Sans date',
  start: 'Démarrer',
  starting: 'Démarrage…',
  startSuccess: 'Run démarré.',
  startError: 'Impossible de démarrer le run.',
});
