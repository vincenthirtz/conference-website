// lib/i18n/locales/admin-fr/adminTournamentCheckinLive.ts
//
// Traductions FRANCAISES du namespace `adminTournamentCheckinLive` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentCheckinLive', {
  headTitle: 'Live check-in — admin',
  backToAdmin: '← Vue admin normale',
  pageTitle: 'Live check-in',
  windowInfo: 'Fenêtre [-{past} min, +{future} min] · poll {poll}s',
  nowLabel: 'Maintenant : {time}',
  lastNudgeLabel: 'Dernière relance : {time}',
  metricMatchesInWindow: 'Matchs en fenêtre',
  metricTeamsCheckedIn: 'Équipes checkées',
  metricCompleteMatches: 'Matchs complets',
  metricNextMatch: 'Prochain match',
  tMinusMin: 'T-{n} min',
  tPlusMin: 'T+{n} min',
  loading: 'Chargement…',
  emptyWindow: 'Aucun match dans la fenêtre actuelle.',
  nudgingShort: 'Relance…',
  nudgeBoth: 'Relance les 2',
  teamSide: 'Équipe {side}',
  checkedInRelative: '✓ Checké {relative}',
  notCheckedIn: '⏳ Pas encore checké',
  nudgeDiscord: 'Relance Discord',
  relativeNow: "à l'instant",
  relativeMinutes: 'il y a {n} min',
  relativeHours: 'il y a {n}h',
  errorLoad: 'Erreur de chargement',
  nudgeNone: 'Aucune équipe à relancer.',
  nudgeSent_one: 'Relance envoyée à {count} capitaine.',
  nudgeSent_other: 'Relance envoyée à {count} capitaines.',
  nudgeError: 'Échec de la relance',
  staffCheckin: "Pointer pour l'équipe",
  staffCheckinTitle: 'Pointer {team} à sa place',
  staffCheckinHelp:
    "Le check-in est posé au nom du staff et journalisé avec le motif. Possible après le coup d'envoi, tant que le forfait automatique n'est pas tombé.",
  staffCheckinReasonLabel: 'Motif (obligatoire)',
  staffCheckinReasonPlaceholder:
    'Ex. capitaine sans accès au lien, présence confirmée sur Discord',
  staffCheckinReasonTooShort: 'Motif trop court ({min} caractères minimum).',
  staffCheckinConfirm: 'Pointer',
  staffCheckinSubmitting: 'Pointage…',
  staffCheckinCancel: 'Annuler',
  staffCheckinDone: '{team} pointée par le staff.',
  staffCheckinAlready: '{team} était déjà pointée.',
  staffCheckinError: 'Échec du pointage',
  forfeitProcessed: 'Forfait déjà traité',
  forfeitProposalPending: 'Forfait à confirmer',
});
