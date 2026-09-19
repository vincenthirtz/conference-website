// lib/i18n/locales/fr/tournamentStandings.ts
//
// Traductions FRANCAISES du namespace `tournamentStandings` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/tournamentStandings.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentStandings', {
  heading: 'Classement – {name}',
  description:
    'Le classement officiel, mis à jour à chaque résultat validé : 3 points par victoire, départage par la confrontation directe.',
  empty:
    'Ce tournoi n’a pas de phase à points : son déroulé se lit sur le bracket.',
  emptyNoResult:
    'Aucun résultat validé pour l’instant : le classement se remplira après les premiers matchs.',
  groupLabel: 'Poule {key}',
  colRank: '#',
  colTeam: 'Équipe',
  colPlayed: 'J',
  colPlayedTitle: 'Matchs joués',
  colWins: 'V',
  colWinsTitle: 'Victoires',
  colLosses: 'D',
  colLossesTitle: 'Défaites',
  colDraws: 'N',
  colDrawsTitle: 'Nuls',
  colMaps: 'Maps',
  colMapsTitle: 'Maps gagnées – perdues',
  colDiff: '+/-',
  colDiffTitle: 'Différence de maps',
  colForm: 'Forme',
  colFormTitle: '{count} derniers résultats, du plus ancien au plus récent',
  colPoints: 'Pts',
  colPointsTitle: 'Points',
  formW: 'Victoire',
  formL: 'Défaite',
  formD: 'Nul',
  formWShort: 'V',
  formLShort: 'D',
  formDShort: 'N',
  tiebrokenBy: 'Départagée par : {criterion}',
  tbHeadToHead: 'confrontation directe',
  tbScoreDiff: 'différence de maps',
  tbWins: 'nombre de victoires',
  tbScored: 'maps gagnées',
  tbSeed: 'tête de série',
  legend:
    'J : joués · V : victoires · D : défaites · +/- : différence de maps · Pts : points. Un astérisque signale une égalité de points départagée ; survolez-le pour le critère.',
  seeMatches: 'Voir tous les matchs',
});
