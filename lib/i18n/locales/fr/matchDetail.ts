// lib/i18n/locales/fr/matchDetail.ts
//
// Traductions FRANCAISES du namespace `matchDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('matchDetail', {
  notFound: 'Match introuvable.',
  teamFallback1: 'Équipe 1',
  teamFallback2: 'Équipe 2',
  bye: '(bye)',
  poolPrefix: 'Poule',
  summary:
    'Résumé complet du match, carte par carte : scores, overtimes, tiebreakers, et infos pratiques.',
  btnTournament: '← Tournoi',
  btnAllMatches: 'Tous les matchs',
  btnBracket: 'Bracket',
  scoreGlobal: 'Score global',
  endPrefix: 'Fin :',
  mapsPlayed_one: '{count} map jouée',
  mapsPlayed_other: '{count} maps jouées',
  mapsDetailTitle: 'Détail par carte',
  mapsRecorded_one: '{count} map enregistrée',
  mapsRecorded_other: '{count} maps enregistrées',
  noMapsDetail:
    'Les détails par carte ne sont pas encore disponibles pour ce match.',
  matchInfo: 'Infos match',
  infoTournament: 'Tournoi',
  infoStage: 'Phase',
  infoRound: 'Round',
  infoPool: 'Poule',
  infoFormat: 'Format',
  infoLobby: 'Lobby',
  infoStream: 'Stream',
  viewStream: 'Voir le stream',
  infoReplay: 'Replay',
  viewVod: 'Voir le VOD ↗',
  infoBye: 'Bye',
  yes: 'Oui',
  no: 'Non',
  staffNotes: 'Notes staff',
  mapLabel: 'Map {n}',
  vs: 'vs',
  tagTiebreaker: 'Tiebreaker',
  tagOvertime: 'Overtime',
  statusPending: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusCancelled: 'Annulé',
  lineupsTitle: 'Compositions',
  lineupsHint: 'Cliquez sur une joueuse pour voir son profil',
  lineupCount_one: '{count} joueuse',
  lineupCount_other: '{count} joueuses',
  lineupSubs: 'Remplaçantes',
  lineupStaff: 'Encadrement',
  lineupEmpty: 'Composition non renseignée pour ce match.',
  lineupUnknown: 'Joueuse inconnue',
  lineupCaptain: 'Capitaine',
  mvpTitle: 'MVP du match',
  mvpBadge: 'MVP',
});
