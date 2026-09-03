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
  emailSenderHeading: "Envoi d'emails",
  emailSenderIntro:
    "Cet espace expédie ses emails depuis SON compte Brevo : l'adresse d'expédition, le quota quotidien et la réputation d'expéditeur lui appartiennent. Tant qu'aucun compte n'est enregistré, aucun email ne part — le bot, le site et Discord continuent de fonctionner normalement.",
  emailSenderPlatformNotice:
    "Cet espace envoie via le compte de la plateforme, configuré en variables d'environnement. Il n'y a rien à renseigner ici.",
  emailSenderConfigured: 'Envoi configuré. Expéditeur :',
  emailSenderNotConfigured:
    "Aucun compte d'envoi : cet espace n'envoie pas d'email pour l'instant.",
  emailSenderNoEncryption:
    "SECRETS_ENC_KEY est absente de l'environnement : la clé ne peut pas être chiffrée, l'enregistrement échouera.",
  emailSenderApiKeyLabel: 'Clé API Brevo',
  emailSenderApiKeyHelp:
    "Brevo › SMTP & API › Clés API. Elle est chiffrée et n'est jamais réaffichée : pour la remplacer, ressaisissez-la.",
  emailSenderFromEmailLabel: "Adresse d'expédition",
  emailSenderFromEmailHelp:
    "Doit être un expéditeur vérifié de ce compte Brevo, sinon l'envoi sera refusé.",
  emailSenderFromNameLabel: 'Nom affiché',
  emailSenderFromLabel: 'Expéditeur :',
  emailSenderSave: 'Enregistrer',
  emailSenderSaving: 'Vérification…',
  emailSenderSaved: "Compte d'envoi enregistré.",
  emailSenderSaveError: 'Enregistrement impossible.',
  emailSenderClear: 'Retirer le compte',
  emailSenderCleared: "Compte d'envoi retiré.",
  emailSenderLoading: 'Chargement…',
  emailSenderLoadError: "État de l'envoi indisponible.",
  tabEmailSender: "Envoi d'emails",
});
