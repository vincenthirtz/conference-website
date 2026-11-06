// lib/i18n/locales/admin-fr/adminTournamentRules.ts
//
// Traductions FRANCAISES du namespace `adminTournamentRules` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.
//
// Reglement a lire et valider par chaque membre, cote staff : le reglage du
// tournoi (edition), la section « Reglement » (depot d'une version, versions,
// validations par equipe), la pastille « Reglement X/Y » des equipes et le
// blocage de l'acceptation d'une inscription.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentRules', {
  // ── Réglage (édition du tournoi) ──────────────────────────────────────
  toggleTitle: 'Règlement à valider',
  toggleLabel: 'Règlement à valider par chaque membre',
  toggleHelp:
    "Chaque joueuse, remplaçante et membre du staff de l'équipe devra lire le règlement PDF jusqu'en bas et le valider. Sans toutes les validations, l'inscription ne peut pas être acceptée. Éteint par défaut ; enregistré avec le reste de la fiche.",

  // ── Section « Règlement » ─────────────────────────────────────────────
  sectionTitle: 'Règlement (lecture obligatoire)',
  sectionIntro:
    'Le PDF que les membres lisent dans la liseuse de leur espace avant de valider. Les anciennes versions sont gardées. Il ne remplace pas le lien public « Règlement » du panneau Visuels.',
  requiredOff:
    'Réglage éteint pour ce tournoi : les versions déposées restent lisibles, personne n’a à les valider.',
  requiredNoVersion:
    "Déposez le règlement : tant qu'aucune version n'est en ligne, personne ne peut valider et aucune inscription ne peut être acceptée.",
  loading: 'Lecture du règlement…',
  loadError: 'Impossible de lire le règlement de ce tournoi.',
  refresh: 'Rafraîchir',

  uploadTitle: 'Déposer une version',
  fileLabel: 'Fichier PDF (15 Mo au maximum)',
  importantLabel: 'Changement important : tout le monde doit revalider',
  importantHelp:
    'Décochée : simple correction (faute de frappe, mise en page) — les validations déjà faites restent valables.',
  noteLabel: 'Ce qui change (montré aux membres)',
  notePlaceholder: 'Ex. : article 4 — les play-offs passent en BO5.',
  noteCount: '{count}/500',
  submit: 'Déposer la version',
  submitting: 'Envoi…',
  errorPdfOnly: 'Seuls les fichiers PDF sont acceptés.',
  errorNotPdf: "Ce fichier n'est pas un PDF valide.",
  errorTooLarge: 'Fichier trop lourd : 15 Mo au maximum.',
  errorNoFile: "Choisissez d'abord un fichier PDF.",
  errorUpload: "La version n'a pas pu être déposée. Réessayez.",
  uploadedImportant:
    'Version {number} déposée. Les membres des équipes engagées doivent la revalider ; ils sont prévenus sur le site.',
  uploadedMinor:
    'Version {number} déposée. Les validations déjà faites restent valables.',
  uploadedNoNumber: 'Version déposée.',

  versionsTitle: 'Versions déposées',
  versionsEmpty: 'Aucune version déposée.',
  versionLabel: 'Version {number}',
  versionCurrent: 'En vigueur',
  versionImportant: 'Changement important',
  versionMinor: 'Correction',
  versionMeta: 'Déposée le {date}',
  versionMetaBy: 'Déposée le {date} par {by}',
  download: 'Télécharger',
  downloadLabel: 'Télécharger la version {number}',

  validationsTitle: 'Validations par équipe',
  validationsEmpty: "Aucune équipe engagée ou candidate pour l'instant.",
  validationsLoadError: 'Impossible de lire les validations.',
  teamCount: '{validated}/{total} validations',
  teamComplete: 'Complet',
  teamIncomplete: 'Incomplet',
  missingTitle: 'Manquent ({count})',
  memberAccepted: 'validé le {date}',
  memberPending: 'pas encore validé',
  memberNoAccount: 'sans compte : ne peut pas valider',

  // ── Pastille « Règlement X/Y » (hub, demandes) ────────────────────────
  chipLabel: 'Règlement {validated}/{total}',
  chipNoVersion: 'Règlement non déposé',
  chipTitleComplete: 'Tous les membres ont validé le règlement.',
  chipTitleIncomplete: 'Validations manquantes : {names}',

  // ── Blocage de l'acceptation d'une inscription ────────────────────────
  gateTitle: 'Règlement du tournoi',
  gateNoVersion:
    "Approbation bloquée : le règlement n'est pas encore déposé (Édition du tournoi › Règlement).",
  gateIncomplete:
    'Approbation bloquée : règlement validé par {validated}/{total} membres.',
  gateMissing: 'Manquent : {names}',
  gateComplete: 'Règlement validé par tous les membres ({validated}/{total}).',
  blockedGeneric:
    "Refusé : le règlement n'est pas encore validé par tous les membres de l'équipe.",
  blockedList:
    'Refusé : règlement pas encore validé par tous les membres — {teams}.',
  blockedTeam_one: '{team} : {missing} validation manquante',
  blockedTeam_other: '{team} : {missing} validations manquantes',

  roles: {
    player: 'joueuse',
    substitute: 'remplaçante',
    captain: 'capitaine',
    coach: 'coach',
    manager: 'manager',
  },
});
