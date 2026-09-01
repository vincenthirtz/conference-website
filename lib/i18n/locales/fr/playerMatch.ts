// lib/i18n/locales/fr/playerMatch.ts
//
// Traductions FRANCAISES du namespace `playerMatch` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerMatch', {
  pageTitle: '{team} vs {opponent}',
  back: 'Retour à mes matchs',
  loading: 'Chargement du match…',
  loadError: "Ce match n'a pas pu être chargé.",
  notFound: 'Ce match est introuvable, ou tu n’y participes pas.',
  retry: 'Réessayer',
  signIn: 'Se connecter',
  connectPrompt: 'Connecte-toi pour suivre ton match.',

  vs: 'vs',
  dateTbd: 'Date à confirmer',
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  statusDisputed: 'En litige',

  // Étapes du fil.
  stepPrepare: 'Préparation',
  stepCheckin: 'Check-in',
  stepLineup: 'Feuille de match',
  stepLive: 'Pendant le match',
  stepScore: 'Après le match',

  prepareBody:
    "Le dossier d'adversaire rassemble ses résultats, ses horaires habituels et ce que ton équipe avait noté la dernière fois.",
  prepareScouting: "Ouvrir le dossier d'adversaire ↗",
  prepareTeamPage: "Voir la page de l'équipe ↗",
  prepareNoOpponent: "L'adversaire n'est pas encore désigné.",

  checkinOpensAt: 'Le check-in ouvre le {date}.',
  checkinOpenNow:
    'Le check-in est ouvert — confirme la présence de ton équipe.',
  checkinDone: 'Check-in confirmé le {date}.',
  checkinMissed: 'La fenêtre de check-in est passée sans confirmation.',
  checkinCta: 'Confirmer le check-in',
  checkinPending: 'Envoi…',
  checkinSuccess: 'Check-in confirmé.',
  checkinAlready: 'Ton équipe était déjà checkée.',
  checkinFailed: 'Le check-in a échoué.',
  checkinNoToken:
    "Le check-in de ce match n'est pas géré depuis l'espace joueur.",
  checkinReadOnly: 'Seule ta capitaine ou ton encadrement peut confirmer.',

  rosterWarning:
    'Il manque {n} joueuse(s) au roster pour atteindre le minimum du tournoi.',
  rosterOk: 'Ton effectif atteint le minimum du tournoi.',

  liveWatch: 'Regarder la diffusion ↗',
  liveNoStream: 'Aucune diffusion annoncée pour ce match.',
  liveMatchPage: 'Ouvrir la fiche publique du match ↗',

  scoreReportCta: 'Rapporter le score',
  scoreEditCta: 'Corriger mon report',
  scoreNone: 'Le score n’a pas encore été rapporté.',
  scoreAwaitingOpponent:
    'Ton report est enregistré ({mine}–{opponent}). En attente de celui de l’adversaire.',
  scoreAwaitingMe:
    'L’adversaire a rapporté le score. À ton tour de confirmer le tien.',
  scoreAgreed: 'Les deux équipes ont rapporté le même score.',
  scoreDisputed:
    'Les deux reports divergent : le staff arbitre. Tu peux corriger le tien.',
  scoreFinal: 'Score final : {mine}–{opponent}.',
  scoreCaptainOnly: 'Seule la capitaine peut rapporter le score.',
  reviewCta: 'Écrire la revue du match ↗',
  reviewBody:
    'Une revue écrite à chaud vaut trois souvenirs. Elle reste dans la mémoire de ton équipe.',

  // ── Préparation (lot J5) ─────────────────────────────────────────────
  prepObjectivesTitle: 'Objectifs du match',
  prepObjectivesHelp:
    "Deux ou trois intentions, écrites avant de jouer. Elles ouvriront la revue d'après-match : c'est là qu'on regarde si elles ont tenu.",
  prepObjectivesPlaceholder:
    'Ex. tenir le premier point · ne pas forcer les ultimates · garder la comm’ courte',
  prepSave: 'Enregistrer',
  prepSaving: 'Enregistrement…',
  prepSaved: 'Objectifs enregistrés.',
  prepUnsaved: 'Non enregistré',
  prepError: "Les objectifs n'ont pas pu être enregistrés.",
});
