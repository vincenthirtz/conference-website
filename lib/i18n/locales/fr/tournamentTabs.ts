// lib/i18n/locales/fr/tournamentTabs.ts
//
// Traductions FRANCAISES du namespace `tournamentTabs` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentTabs', {
  navLabel: 'Navigation du tournoi',
  hub: 'Aperçu',
  teams: 'Équipes',
  matches: 'Matchs',
  bracket: 'Bracket',
  maps: 'Maps',
  stats: 'Stats',
  mvp: 'MVP',
  podium: 'Podium',
  ffa: 'FFA',
});
