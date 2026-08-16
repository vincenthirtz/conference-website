// lib/i18n/locales/admin-fr/adminTournamentsCreate.ts
//
// Traductions FRANCAISES du namespace `adminTournamentsCreate` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentsCreate', {
  headTitle: 'Admin – Créer un tournoi',
  backToList: 'Retour a la liste des tournois',
  pageTitle: 'Nouveau tournoi',
  pageSubtitle:
    'Configure les informations de base, tu pourras affiner les stages / matchs ensuite.',
  templateTitle: 'Template de structure',
  templateHelp:
    'Choisis un template pour creer automatiquement les stages du tournoi, ou laisse vide pour les configurer manuellement.',
  noTemplate: 'Aucun template',
  noTemplateDesc: 'Configurer les stages manuellement apres la creation.',
  generalInfo: 'Informations generales',
  nameLabel: 'Nom du tournoi',
  slugLabel: 'Slug (URL)',
  slugHelp: 'Laisse vide pour generer automatiquement.',
  gameLabel: 'Jeu',
  statusLabel: 'Statut',
  statusDraft: 'Brouillon',
  statusPublished: 'Publie',
  statusRunning: 'En cours',
  statusCompleted: 'Termine',
  statusArchived: 'Archive',
  planningFormat: 'Planning & format',
  startDateLabel: 'Date de debut',
  endDateLabel: 'Date de fin',
  globalFormatLabel: 'Format global',
  formatTbd: '(A definir plus tard)',
  formatSingleElim: 'Single Elim',
  formatDoubleElim: 'Double Elim',
  formatSwiss: 'Swiss',
  formatRoundRobin: 'Round Robin',
  formatShowmatch: 'Showmatch',
  maxTeamsLabel: "Nombre max. d'equipes",
  minPlayersLabel: 'Nombre min. de joueurs par equipe',
  maxPlayersLabel: 'Nombre max. de joueurs par equipe',
  visibilityVisuals: 'Visibilite & visuels',
  makePublic: 'Rendre le tournoi public sur le site',
  makeFeatured: 'Mettre en avant (section "featured")',
  logoUrlLabel: 'Logo (URL)',
  bannerUrlLabel: 'Banniere (URL)',
  creating: 'Creation en cours...',
  createButton: 'Creer le tournoi',
  cancel: 'Annuler',
  preview: 'Apercu',
  logoAlt: 'Logo',
  nameFallback: 'Nom du tournoi',
  badgePublic: 'Public',
  badgeFeatured: 'Featured',
  templateSelected: 'Template selectionne',
  templateStagesNote:
    'Les stages seront crees automatiquement apres la creation du tournoi.',
  infoTitle: 'Informations',
  infoDraftDefault: 'Le tournoi sera cree en mode brouillon par defaut.',
  infoConfigureLater:
    'Tu pourras configurer les stages et matchs apres la creation.',
  infoSlugUsage: "Le slug est utilise pour l'URL publique du tournoi.",
  errorNameRequired: 'Le nom du tournoi est obligatoire.',
  errorEndAfterStart:
    'La date de fin doit être postérieure à la date de début.',
  errorCreate: 'Erreur lors de la création du tournoi',
  errorCreateUnknown: 'Erreur inconnue lors de la création du tournoi',
  errorTemplatesLoad: 'Impossible de charger les modèles personnalisés.',
});
