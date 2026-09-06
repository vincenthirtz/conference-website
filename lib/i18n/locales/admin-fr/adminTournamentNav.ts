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

  // Les huit GROUPES de premier niveau.
  tabDashboard: 'Tableau de bord',
  tabCheckin: 'Check-in',
  tabMatches: 'Matchs',
  tabBracket: 'Bracket',
  tabStages: 'Phases',
  tabResults: 'Résultats',
  tabSettings: 'Réglages',
  tabTools: 'Outils',

  // Seconde ligne : les écrans du groupe actif.
  subMatchesList: 'Liste',
  subMatchesSchedule: 'Planning',
  subMatchesBulk: 'En masse',
  subSettingsGeneral: 'Général',
  subSettingsMaps: 'Pool de maps',
  subSettingsDiscord: 'Discord',
  subSettingsPrizePool: 'Cagnotte',
  subToolsActions: 'Actions',
  subToolsHistory: 'Historique',

  // Sous-onglets rendus par les pages elles-mêmes (`?tab=`).
  subCheckinSettings: 'Réglages',
  subCheckinLive: 'Console live',
  subBracketView: 'Arbre',
  subBracketBuilder: 'Éditeur',
  subBracketMapDraw: 'Tirage maps',
  subBracketVeto: 'Veto',
  subStatsOverview: 'Classement',
  subStatsAnalytics: 'Analytics',
  subStatsPodium: 'Podium',

  // Conservées : d'autres écrans s'en servent comme titre de page.
  tabStats: 'Résultats',
  tabMaps: 'Pool de maps',
  tabDiscord: 'Discord',
  tabPrizePool: 'Cagnotte',
  tabHistory: 'Historique',
  tabEdit: 'Général',
  tabSchedule: 'Planning',
  tabBulkOps: 'En masse',
});
