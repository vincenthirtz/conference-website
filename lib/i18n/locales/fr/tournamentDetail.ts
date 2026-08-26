// lib/i18n/locales/fr/tournamentDetail.ts
//
// Traductions FRANCAISES du namespace `tournamentDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentDetail', {
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  seasonLabel: 'Saison',
  heroDescription:
    "Suivez le bracket, les résultats, les maps et les équipes de cette édition de la OW Women's Cup. Tout ce qu'il faut pour caster, analyser ou simplement vibrer avec le tournoi.",
  ctaBracket: 'Voir le bracket',
  ctaAllMatches: 'Tous les matchs',
  ctaTopMaps: 'Top maps',
  ctaFfaStandings: 'Classement FFA',
  ctaOfficialPodium: 'Podium officiel',
  ctaRegisterTeam: 'Inscrire mon équipe',
  rulesLink: 'Règlement du tournoi',
  statTeams: 'Équipes',
  statMatches: 'Matchs',
  statStages: 'Stages',
  statFormat: 'Format',
  hintRegistered: '{count}/{max} inscrites',
  hintFinished: '{count} terminés',
  infoTitle: 'Infos',
  scheduleTitle: 'Calendrier',
  scheduleRulesTitle: 'Règles des horaires',
  formatDetailsTitle: 'Détails du format',
  stagesHeading: 'Phases du tournoi',
  stagesCount_one: '{count} phase',
  stagesCount_other: '{count} phases',
  stagesEmpty: 'Les phases de ce tournoi ne sont pas encore publiées.',
  stageTypeGroup: 'Poule',
  stageTypeBracket: 'Bracket',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round robin',
  stageTypeShowmatch: 'Showmatch',
  stageTypeOther: 'Autre',
  stageSwissRounds: ' · {count} rounds',
  stageFormatLabel: 'Format : {format}',
  bracketLabel: 'Bracket',
  keyMatchesHeading: 'Matches clés',
  viewAllMatches: 'Voir tous les matchs →',
  upcomingHeading: 'Prochains matchs',
  upcomingEmpty: 'Aucun match à venir programmé.',
  recentHeading: 'Derniers résultats',
  recentEmpty: 'Aucun résultat publié.',
  teamsHeading: 'Équipes du tournoi',
  teamsCount_one: '{count} équipe',
  teamsCount_other: '{count} équipes',
  teamsEmpty: 'Les équipes ne sont pas encore affichées pour ce tournoi.',
  teamsMore: '+ {count} autres',
  mapsHeading: 'Aperçu des maps',
  viewAllMaps: 'Voir toutes les maps →',
  mapsDescription:
    'Consultez les cartes les plus jouées du tournoi, les overtimes et les tiebreakers pour analyser la meta des maps.',
  mapsNoteBefore:
    'Les stats détaillées (popularité, overtimes, rounds moyens) sont visibles sur la page ',
  mapsNoteLink: 'Top maps',
  mapsNoteAfter: '.',
  vsLabel: 'vs',
  byeLabel: '(bye)',
  teamPlaceholder1: 'Équipe 1',
  teamPlaceholder2: 'Équipe 2',
});
