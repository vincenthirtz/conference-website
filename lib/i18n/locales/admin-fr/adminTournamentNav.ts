// lib/i18n/locales/admin-fr/adminTournamentNav.ts
//
// Traductions FRANCAISES du namespace `adminTournamentNav` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentNav', {
  ariaLabel: 'Navigation du tournoi',
  back: '← Tournoi',
  backToList: '← Tournois',
  tabDashboard: 'Dashboard',
  tabCheckin: 'Check-in',
  tabBracket: 'Bracket',
  tabMatches: 'Matchs',
  tabSchedule: 'Planning',
  tabStages: 'Stages',
  tabStats: 'Stats',
  tabMaps: 'Maps',
  tabDiscord: 'Discord',
  tabPrizePool: 'Cagnotte',
  tabHistory: 'Historique',
  tabEdit: 'Édition',
  tabTools: 'Outils',
  tabBulkOps: 'Ops groupées',
  tabMore: 'Plus',
  subCheckinSettings: 'Réglages',
  subCheckinLive: 'Console live',
  subBracketView: 'Arbre',
  subBracketBuilder: 'Éditeur',
  subBracketMapDraw: 'Tirage maps',
  subBracketVeto: 'Veto',
  subStatsOverview: 'Statistiques',
  subStatsAnalytics: 'Analytics',
  subStatsPodium: 'Podium',
});
