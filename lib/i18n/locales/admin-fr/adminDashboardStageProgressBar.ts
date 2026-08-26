// lib/i18n/locales/admin-fr/adminDashboardStageProgressBar.ts
//
// Traductions FRANCAISES du namespace `adminDashboardStageProgressBar` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardStageProgressBar', {
  stageTypeGroup: 'Poule',
  stageTypeBracket: 'Bracket',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round Robin',
  stageTypeShowmatch: 'Showmatch',
  teamsCount_one: '{count} équipe',
  teamsCount_other: '{count} équipes',
  ongoingSuffix: '· {count} en cours',
  advanceTitle: 'Avancer automatiquement les équipes vers la phase suivante',
  advance: '🚀 Avancer',
  view: 'Voir →',
  remaining_one: '{count} match restant',
  remaining_other: '{count} matchs restants',
  cadenceTitle: 'Cadence sur 12h : {values}',
});
