// lib/i18n/locales/admin-fr/adminSiteSettings.ts
//
// Traductions FRANCAISES du namespace `adminSiteSettings` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminSiteSettings', {
  pageTitle: 'Admin – Paramètres du site',
  heading: 'Paramètres du site',
  subtitle: 'Configurez les paramètres globaux du site',
  advancedHeading: 'Configurations avancees',
  advancedSubtitle:
    'Pages dediees pour les parametres complexes (multi-cles, par type, ou avec test).',
  discordTitle: 'Webhooks Discord (maitre)',
  discordDesc:
    "Fallback global utilise quand un tournoi n'a pas declare son propre webhook pour un type de channel.",
  teamRolesTitle: "Rôles d'équipe",
  teamRolesDesc:
    "Liste des rôles proposés dans les selects des formulaires d'ajout / édition de membre.",
  saving: 'Sauvegarde...',
  save: 'Sauvegarder',
  lastModified: 'Dernière modification :',
  preview: 'Aperçu :',
  videoPreviewTitle: 'Aperçu vidéo',
  saveSuccess: 'Paramètre sauvegardé avec succès',
  saveError: 'Erreur de sauvegarde.',
  contactEmailLabel: 'Email de contact',
  contactEmailDesc:
    'Email de contact principal affiché sur le site (pages contact, mentions légales, etc.)',
  aboutVideoLabel: 'URL vidéo "A propos"',
  aboutVideoDesc:
    'URL de la vidéo affichée dans la section "A propos" de la page d\'accueil (YouTube ou MP4)',
  cotisationAmountLabel: 'Montant de la cotisation annuelle',
  cotisationAmountDesc:
    'Montant de la cotisation annuelle pour les adhérents (en euros)',
  cotisationYearLabel: 'Année de cotisation en cours',
  cotisationYearDesc: 'Année de cotisation active pour le suivi des paiements',
  eventDateLabel: "Date de l'événement (compte à rebours)",
  eventDateDesc:
    "Date ISO du prochain événement affiché en compte à rebours sur la page d'accueil. Si vide, la date de début du prochain tournoi est utilisée. Format : 2026-06-15T18:00:00+02:00",
  tabsAriaLabel: 'Sections des paramètres',
  tabGeneral: 'Général',
  tabDiscord: 'Discord',
  tabTeamRoles: 'Rôles d’équipe',
});
