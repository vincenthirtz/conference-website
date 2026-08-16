// lib/i18n/locales/fr/matchGames.ts
//
// Traductions FRANCAISES du namespace `matchGames` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('matchGames', {
  notFound: 'Match introuvable.',
  docTitle: "Maps – {team1} vs {team2} | {tournament} | OW Women's Cup",
  team1Fallback: 'Équipe 1',
  team2Fallback: 'Équipe 2',
  byeLabel: '(bye)',
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusCancelled: 'Annulé',
  detailHeading: 'Détail des maps',
  vs: 'vs',
  poule: 'Poule {key}',
  intro:
    'Vue centrée sur les games de ce match : scores détaillés carte par carte, overtimes, tiebreakers et total de rounds.',
  backToSummary: '← Résumé du match',
  tournament: 'Tournoi',
  topMaps: 'Top maps du tournoi',
  noMapsYet: "Aucune carte n'est encore enregistrée pour ce match.",
  statMapsPlayed: 'Maps jouées',
  statRoundsTeam: 'Rounds {team}',
  statRoundsDiff: 'Différence de rounds',
  balanced: 'Équilibré',
  mapsOfMatch: 'Cartes du match',
  mapsRecorded_one: '{count} map enregistrée',
  mapsRecorded_other: '{count} maps enregistrées',
  colMap: 'Map',
  colTotalRounds: 'Total rounds',
  colTags: 'Tags',
  mapFallback: 'Map {order}',
  tagTiebreaker: 'Tiebreaker',
  tagOvertime: 'Overtime',
  scoresHint:
    'Les scores correspondent aux manches cumulées remportées par chaque équipe sur la carte (rounds, points, etc. selon le mode de jeu).',
});
