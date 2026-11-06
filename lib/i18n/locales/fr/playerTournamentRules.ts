// lib/i18n/locales/fr/playerTournamentRules.ts
//
// Traductions FRANCAISES du namespace `playerTournamentRules` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Reglement a lire et valider par chaque membre : la liseuse
// (/player/tournaments/[id]/reglement), le bandeau du tableau de bord et la
// carte « Reglement » de la capitaine (gestion de l'equipe).

import { ns } from '../../ns';

export default ns('playerTournamentRules', {
  // ── Liseuse ────────────────────────────────────────────────────────────
  pageTitle: 'Règlement',
  titleWithTournament: 'Règlement · {tournament}',
  loading: 'Chargement du règlement…',
  loadError:
    "Impossible de lire l'état du règlement. Vérifie ta connexion et réessaie.",
  retry: 'Réessayer',
  versionMeta: 'Version {number} · déposée le {date}',
  versionMetaPages: 'Version {number} · {pages} pages · déposée le {date}',
  whatChanges: 'Ce qui change dans cette version',
  importantChange: 'Changement important : tout le monde doit revalider.',
  minorChange:
    'Simple correction : les validations déjà faites restent valables.',
  teamLine: 'Ton équipe : {team}',
  noVersion:
    "Le règlement de ce tournoi n'a pas encore été déposé par le staff.",
  noVersionRequired:
    "Tu pourras le lire et le valider dès qu'il sera en ligne : une notification te préviendra.",
  notRequired:
    'Ce tournoi ne demande pas de validation du règlement : il est ici en lecture.',
  notMember:
    "Tu n'es membre d'aucune équipe inscrite à ce tournoi : tu peux lire le règlement, sans avoir à le valider.",
  notConcerned:
    "Ton rôle dans l'équipe ne demande pas de validation : le règlement est ici en lecture.",
  download: 'Télécharger le PDF',
  backToSpace: 'Retour à mon espace',

  zoneLabel: 'Règlement, {pages} pages',
  zoneLabelLoading: 'Règlement (chargement)',
  zoneHelp:
    'Fais défiler cette zone avec la molette, le doigt ou les touches flèches, Page suivante et Fin.',
  pageAlt: 'Page {n} sur {total}',
  pageText: 'Texte de la page {n}',
  pdfLoading: 'Ouverture du PDF…',
  pdfRendering: 'Mise en page : {done} / {total} pages',
  pdfErrorFile:
    "Le règlement n'a pas pu être téléchargé. Vérifie ta connexion, puis réessaie.",
  pdfErrorPdf:
    "Le règlement n'a pas pu être affiché. Réessaie ; si le problème continue, préviens le staff.",
  pdfErrorLocked:
    "La validation reste bloquée tant que le règlement ne s'affiche pas en entier.",
  endMarker: 'Fin du règlement',

  zoomGroup: 'Zoom du règlement',
  zoomOut: 'Zoom arrière',
  zoomIn: 'Zoom avant',
  zoomFit: 'Ajuster à la largeur',
  zoomFitShort: 'Ajuster',
  zoomLevelPrefix: 'Zoom :',
  zoomLevel: '{percent} %',

  scrollHint: "Fais défiler le règlement jusqu'en bas pour pouvoir le valider.",
  reachedEnd: 'Tu as atteint la fin du règlement : tu peux cocher la case.',
  checkboxLabel: "J'ai bien lu le règlement et je m'engage dans ce tournoi",
  checkboxLockedHint:
    "Case inactive : elle s'active quand tu as fait défiler le règlement jusqu'en bas.",
  checkboxUnlockedHint: 'Coche la case pour pouvoir accepter.',
  accept: 'Accepter',
  accepting: 'Enregistrement…',
  acceptError: "Ta validation n'a pas pu être enregistrée. Réessaie.",
  outdated:
    "Une nouvelle version du règlement vient d'être déposée : lis-la avant de valider.",
  loadNewVersion: 'Charger la nouvelle version',

  thanks: 'Merci, ta validation est enregistrée',
  acceptedOn: 'Validé le {date}',
  alreadyAccepted: 'Tu as validé ce règlement (version {number}).',
  reread: 'Relire le règlement',
  hideReader: 'Masquer le règlement',

  // ── Bandeau (tableau de bord) ─────────────────────────────────────────
  bannerTitle: 'Le règlement de {tournament} attend ta validation',
  bannerBody:
    "Chaque membre de l'équipe {team} doit le lire jusqu'au bout et le valider : sans toutes les validations, l'inscription reste incomplète.",
  bannerNewVersion: 'Nouvelle version — {note}',
  bannerCta: 'Lire et valider',

  // ── Carte capitaine (gestion de l'équipe) ─────────────────────────────
  teamTitle: 'Règlement : {validated}/{total} validations',
  teamTitleShort: 'Règlement du tournoi',
  teamComplete: 'Complet',
  teamIncomplete: 'Incomplet',
  teamIntro:
    "Chaque joueuse, remplaçante et membre du staff de l'équipe doit lire et valider le règlement. Tant qu'il manque une validation, le staff ne peut pas accepter l'inscription.",
  teamRegisteredIncomplete:
    "L'inscription est déjà acceptée, mais un membre n'a pas encore validé : le staff le voit. Pense à le relancer.",
  teamBeforeSubmit:
    "Ce tournoi demande que chaque membre (joueuses, remplaçantes, staff de l'équipe) lise et valide son règlement. Après l'envoi de l'inscription, chacun·e reçoit une notification sur le site.",
  teamNoVersion:
    "Le staff n'a pas encore déposé le règlement : personne ne peut encore le valider.",
  teamLoading: 'Lecture des validations…',
  teamLoadError: "Impossible de lire les validations de l'équipe.",
  teamMembersLabel: 'Validations des membres',
  memberAccepted: 'Validé le {date}',
  memberPending: 'Pas encore validé',
  memberNoAccount: 'Sans compte sur le site : ne peut pas valider',
  remind: 'Relancer',
  reminding: 'Envoi…',
  remindHelp:
    "Envoie une notification sur le site aux membres qui n'ont pas validé. Au plus une relance par 24 h.",
  remindDone_one: '{count} membre relancé.',
  remindDone_other: '{count} membres relancés.',
  remindNone:
    'Personne à relancer : tous les membres qui ont un compte ont validé.',
  remindTooSoon: 'Relance déjà envoyée. Prochaine relance possible le {date}.',
  remindTooSoonNoDate: 'Relance déjà envoyée il y a moins de 24 h.',
  remindError: "La relance n'a pas pu partir. Réessaie.",
  selfPending: 'Toi aussi, tu dois lire et valider le règlement.',
  selfCta: 'Lire et valider',
  readCta: 'Lire le règlement',

  roles: {
    player: 'Joueuse',
    substitute: 'Remplaçante',
    captain: 'Capitaine',
    coach: 'Coach',
    manager: 'Manager',
  },
});
