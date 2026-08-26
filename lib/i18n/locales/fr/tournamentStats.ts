// lib/i18n/locales/fr/tournamentStats.ts
//
// Traductions FRANCAISES du namespace `tournamentStats` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentStats', {
  headTitle: "Stats équipes – {name} | OW Women's Cup",
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  heading: 'Stats équipes – {name}',
  description:
    'Classement des équipes sur ce tournoi selon leurs victoires, leur différence de maps et leur régularité. Parfait pour préparer un cast ou une analyse desk.',
  backToTournament: '← Retour au tournoi',
  allMatches: 'Tous les matchs',
  topMaps: 'Top maps',
  mvp: 'MVP',
  bracket: 'Bracket',
  empty:
    "Aucune statistique n'est disponible pour ce tournoi pour l'instant. Les stats apparaîtront dès que des matchs auront été joués et enregistrés.",
  statTeams: 'Équipes',
  statMatchesPlayed: 'Matchs joués',
  hintParticipations: '{count} participations au total',
  statTopWinrate: 'Top winrate',
  statBestMapDiff: 'Meilleure diff maps',
  top3Heading: 'Top 3 équipes du tournoi',
  fullRankingHeading: 'Classement complet des équipes',
  colTeam: 'Équipe',
  colMatches: 'Matchs',
  colWins: 'V',
  colLosses: 'D',
  colWinrate: 'Winrate',
  colMaps: 'Maps (+/-)',
  note: 'Les statistiques sont calculées à partir des matchs joués sur ce tournoi, en excluant les matchs automatiquement gagnés par bye.',
  rankTeamFirst: '1er équipe',
  rankTeamSecond: '2e équipe',
  rankTeamThird: '3e équipe',
  winratePct: '{rate}% de victoire',
  matchesLabel: 'Matchs :',
  wdLabel: 'V/D :',
  mapsLabel: 'Maps :',
});
