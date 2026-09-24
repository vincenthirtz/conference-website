// lib/i18n/locales/fr/tournamentBracket.ts
//
// Traductions FRANCAISES du namespace `tournamentBracket` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentBracket', {
  headTitle: "Bracket – {name} | OW Women's Cup",
  heading: 'Bracket – {name}',
  description:
    "L'arbre du tournoi : suivez la progression des équipes, manche après manche, jusqu'à la finale.",
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  emptyTitle: 'Bracket bientôt disponible',
  emptyBody:
    "L'arbre du tournoi n'est pas encore publié. En attendant, consultez la liste des matchs.",
  viewMatches: 'Voir les matchs',
  finalsHeading: 'Phase finale – {name}',
  finalsDescription:
    'Les {count} premières de la saison régulière se qualifient : 1re contre 2e en grande finale, 3e contre 4e en petite finale.',
  finalsProjected: 'Si la saison s’arrêtait ce soir',
  finalsConfirmed: 'Affiche définitive',
  finalsNotStarted: 'Les affiches se dessineront après la première journée.',
  finalsSeed: '{rank}e de la saison',
  finalsSeedFirst: '1re de la saison',
  finalsTbd: 'À déterminer',
  finalsVs: 'vs',
  finalsWatchMatch: 'Voir le match',
  raceTitle: 'La course aux finales',
  raceSubtitle:
    '« Qualifiée » et « éliminée » ne s’affichent qu’une fois acquises au nombre de points, départages non compris.',
  raceSubtitleOver: 'Saison régulière terminée : les affiches sont fixées.',
  raceColTeam: 'Équipe',
  raceColPoints: 'Pts',
  raceColRemaining: 'Reste',
  raceColMax: 'Max',
  raceColStatus: 'Statut',
  raceQualified: 'Qualifiée',
  raceEliminated: 'Éliminée',
  raceContention: 'En course',
  raceCutLine: 'Ligne de qualification',
  raceRemainingTitle: '{count} match(s) à jouer',
  raceMaxTitle: 'Points atteignables en gagnant tout ce qui reste',
  raceSeeStandings: 'Classement complet',
  finalsEmptyTitle: 'Phase finale bientôt annoncée',
  finalsEmptyBody:
    'Les matchs de la phase finale ne sont pas encore programmés. En attendant, suivez le classement.',
});
