// lib/i18n/locales/admin-fr/adminTournamentEdit.ts
//
// Traductions FRANCAISES du namespace `adminTournamentEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentEdit', {
  pageTitle: 'Admin – Éditer le tournoi',
  breadcrumbTournaments: 'Tournois',
  defaultTournamentName: 'Tournoi',
  breadcrumbEdit: 'Modifier',
  back: 'Retour au dashboard du tournoi',
  heading: 'Éditer le tournoi',
  subtitle: 'Mets à jour les informations principales du tournoi.',
  sectionGeneral: 'Informations générales',
  nameLabel: 'Nom du tournoi',
  slugLabel: 'Slug (URL)',
  slugHelp: "Si tu modifies le slug, l'URL publique changera.",
  gameLabel: 'Jeu',
  statusLabel: 'Statut',
  statusDraft: 'Brouillon',
  statusPublished: 'Publié',
  statusRunning: 'En cours',
  statusCompleted: 'Terminé',
  statusArchived: 'Archivé',
  sectionSchedule: 'Planning & format',
  startDateLabel: 'Date de début',
  endDateLabel: 'Date de fin',
  rosterLockLabel: 'Verrouillage roster',
  rosterLockHelp:
    'Au-delà de cette date, les équipes inscrites ne peuvent plus modifier leur roster (ajout, suppression, swap). Vide = pas de verrou.',
  timezoneLabel: 'Fuseau horaire',
  timezoneHelp: 'Les horaires seront affichés dans ce fuseau.',
  formatLabel: 'Format (libellé court)',
  formatHelp:
    'Texte court affiché sur la carte « Format » de la page publique (ex. « BO3 », « Suisse + playoffs »).',
  formatTypeLabel: 'Format global',
  formatTypeNone: '(Ne pas modifier / à définir)',
  formatSingleElim: 'Single Elim',
  formatDoubleElim: 'Double Elim',
  formatSwiss: 'Swiss',
  formatRoundRobin: 'Round Robin',
  formatShowmatch: 'Showmatch',
  maxTeamsLabel: "Nombre max. d'équipes",
  minPlayersLabel: 'Joueuses min. par équipe',
  minPlayersHelp: 'Nombre minimum de membres requis pour inscrire une équipe',
  maxPlayersLabel: 'Joueuses max. par équipe',
  maxPlayersHelp: 'Nombre maximum de membres autorisé par équipe',
  soloModeLabel: 'Inscription individuelle (sans équipe)',
  soloModeHelp:
    "Chaque participante s'inscrit seule depuis /tournament/<id>/inscription-solo et compte pour une « équipe » d'une joueuse portant son pseudo. Aucun rôle ni salon Discord n'est créé pour elle. Le format FFA (classement par points) est celui qui convient à ce type d'événement.",
  pooledTeamsLabel: 'Inscription individuelle regroupée en équipes de 5',
  pooledTeamsHelp:
    'Chaque joueuse s’inscrit seule (connexion requise). Dès que 5 membres d’une même équipe sont inscrites, l’équipe est inscrite avec elles ; les autres vont en liste d’attente, que le staff répartit. Les compositions de l’événement ne modifient pas les vraies équipes. Laisser « joueuses max » vide.',
  sectionVisuals: 'Visuels',
  logoLabel: 'Logo (URL)',
  bannerLabel: 'Bannière (URL)',
  rulesLabel: 'Règlement (PDF)',
  uploading: 'Upload…',
  uploadPdf: 'Uploader un PDF',
  rulesHelp:
    'Affiché en lien « Règlement du tournoi » sur la page publique. PDF max 5 Mo.',
  openCurrentRules: 'Ouvrir le règlement actuel ↗',
  defaultStreamLabel: 'Chaîne de diffusion (par défaut)',
  defaultStreamHelp:
    "Chaîne sur laquelle le tournoi est diffusé. Chaque match en hérite : inutile de la répéter match par match, et l'alerte « sans stream attribué » ne se déclenche plus que si personne ne diffuse. Un match ne porte une URL propre que s'il déroge (chaîne partenaire, co-stream d'une équipe).",

  sectionPublic: 'Informations publiques',
  publicHelp:
    "Ces champs sont affichés sur la page publique du tournoi uniquement s'ils sont remplis.",
  heroSubtitleLabel: 'Accroche (sous le nom du tournoi)',
  heroSubtitlePlaceholder:
    'Vide = accroche par défaut : « La compétition Overwatch 100 % féminine et inclusive. Cinq maps… »',
  descriptionLabel: 'Infos générales',
  descriptionPlaceholder:
    'Description du tournoi visible sur la page publique...',
  scheduleDetailsLabel: 'Calendrier précis',
  scheduleDetailsPlaceholder: 'Dates clés, phases, deadlines...',
  scheduleRulesLabel: 'Règles des horaires',
  scheduleRulesPlaceholder: 'Horaires de check-in, heures de match, délais...',
  formatDetailsLabel: 'Format du tournoi',
  formatDetailsPlaceholder:
    'Format des matchs, BO3/BO5, bracket, règles spécifiques...',
  sectionVisibility: 'Visibilité',
  publicToggle: 'Tournoi public',
  publicToggleHelp: 'Visible sur le site',
  featuredToggle: 'Mis en avant',
  featuredToggleHelp: 'Section "featured"',
  sectionActions: 'Actions',
  saving: 'Enregistrement...',
  saveChanges: 'Enregistrer les modifications',
  cancel: 'Annuler',
  errorPdfOnly: 'Seuls les fichiers PDF sont acceptés.',
  errorPdfTooLarge: 'PDF trop lourd (max 5 Mo).',
  errorRulesUpload: "Échec de l'upload du règlement",
  toastRulesUploaded: 'Règlement uploadé.',
  errorUploadFailed: 'Upload impossible',
  errorLoad: 'Erreur inattendue lors du chargement du tournoi',
  errorNameRequired: 'Le nom du tournoi est obligatoire.',
  errorEndBeforeStart:
    'La date de fin doit être postérieure à la date de début.',
  toastUpdated: 'Tournoi mis à jour avec succès.',
  errorUpdate: 'Erreur inconnue lors de la mise à jour',
});
