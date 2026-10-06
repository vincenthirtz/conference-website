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
  sessionExpired: 'Ta session a expiré.',
  signinAgain: 'Se reconnecter',

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
  // Membre qui ne peut pas pointer (ni capitaine, ni coach, ni manager).
  checkinRestricted:
    'Le check-in est fait par la capitaine, le coach ou la manager.',

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
  // Litige ouvert (lot P4) : les deux déclarations, le délai, le recours.
  disputeMine: 'Ton équipe a déclaré {mine}–{opponent}.',
  disputeOpponent:
    'L’adversaire a déclaré {mine}–{opponent} (ton score en premier).',
  disputeOpponentNone: 'L’adversaire n’a pas déclaré de score.',
  disputeStaffOpened:
    'Le staff a ouvert un litige sur ce match : c’est lui qui fixera le résultat.',
  disputeExpectedBy:
    'Arbitrage attendu d’ici le {date} (délai visé : {duration}).',
  disputeOverdue:
    'Le délai d’arbitrage visé ({duration}) est dépassé : le staff est relancé automatiquement.',
  disputeSlaOnly:
    'Délai d’arbitrage visé : {duration} après l’ouverture du litige.',
  disputeTicketHint:
    'Un élément à faire valoir ? Joins une capture ci-dessous, ou écris au staff.',
  disputeTicketCta: 'Ouvrir un ticket litige ↗',
  disputeTicketSubject: 'Litige de score — {team} vs {opponent}',
  disputeTicketMessage:
    'Match : {url}\nNotre déclaration : {mine}–{opponent}.\n\nCe que nous contestons : ',
  durationMinutes: '{n} min',
  durationHours: '{n} h',
  durationHoursMinutes: '{h} h {m} min',
  // Preuve jointe depuis le site (lot P4).
  evidenceTitle: 'Capture du score',
  evidenceHelp:
    'Joins une capture de l’écran de fin (PNG, JPEG ou WebP, 4 Mo max). Elle est transmise au staff avec ton report.',
  evidenceCta: 'Joindre une capture',
  evidenceUploading: 'Envoi de la capture…',
  evidenceSuccess: 'Capture jointe au match.',
  evidenceSent: 'Capture(s) jointe(s) depuis cette page : {n}.',
  evidenceErrTooLarge: 'Capture trop lourde (4 Mo max).',
  evidenceErrType: 'Ce fichier n’est pas une image PNG, JPEG ou WebP.',
  evidenceErrRight:
    'Seule la capitaine ou une manager d’une des équipes peut joindre une preuve.',
  evidenceErrBothSides:
    'Tu tiens les deux équipes de ce match : chaque équipe joint ses preuves séparément.',
  evidenceErrRateLimited: 'Trop d’envois. Réessaie dans une minute.',
  evidenceErrSession:
    'Ta session a expiré. Reconnecte-toi puis renvoie la capture.',
  evidenceErrGeneric: 'La capture n’a pas pu être envoyée. Réessaie.',
  scoreCaptainOnly: 'Seule la capitaine peut rapporter le score.',
  scoreAfterKickoff: "Le score se rapporte une fois le coup d'envoi passé.",
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
