// lib/i18n/locales/fr/onboardRequest.ts
//
// Traductions FRANCAISES du namespace `onboardRequest` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('onboardRequest', {
  slugRequired: 'Le slug est requis.',
  slugFormat:
    '3 à 30 caractères, commence par une lettre, ensuite lettres/chiffres/tirets.',
  slugReserved: 'Ce slug est réservé.',
  loading: 'Chargement…',
  signInTitle: 'Connexion requise',
  signInBody:
    'Pour demander le bot, nous avons besoin de votre identifiant Discord. Connectez-vous pour démarrer le formulaire.',
  noPassword: 'Aucun mot de passe à créer.',
  backToIntro: 'Retour à la présentation',
  linkTitle: 'Liez votre compte Discord',
  linkBodyConnected: 'Vous êtes connecté',
  linkBodyRest:
    "mais votre identité Discord n'est pas liée à ce compte. Pour demander le bot, vous devez d'abord lier votre Discord.",
  linkCtaLabel: 'Lier mon compte Discord',
  linkRedirectNote:
    'Vous serez redirigé vers Discord pour autoriser la liaison, puis ramené ici pour remplir le formulaire.',
  slugAvailable: 'Slug disponible — sera votre URL.',
  step1Badge: 'Étape 1/3',
  step1Sub: 'Demande du bot',
  formTitle: 'Décrivez votre organisation',
  formSubtitle:
    "Toutes les infos sont éditables plus tard depuis l'admin. Nous vous envoyons un email de confirmation après envoi.",
  slugLabel: 'Slug (URL)',
  slugHintBefore: 'Apparaîtra dans vos URLs (',
  slugHintAfter:
    '). 3 à 30 caractères, démarre par une lettre. Mots réservés :',
  slugFallback: 'votre-slug',
  orgNameLabel: "Nom de l'organisation",
  orgNamePlaceholder: 'ex: Esport Club FR',
  emailLabel: 'Email de contact',
  emailPlaceholder: 'contact@votre-domaine.tld',
  emailHint:
    'Le lien de confirmation est envoyé ici. Utilisez une adresse que vous consultez vraiment.',
  descriptionLabel: 'Description',
  optional: '(optionnelle)',
  descriptionPlaceholder:
    'Quelques mots sur votre organisation, vos tournois habituels, votre communauté…',
  captchaMissing:
    'Captcha non configuré (NEXT_PUBLIC_TURNSTILE_SITE_KEY). Soumission autorisée en dev — la vérification serveur bloquera de toute façon en production.',
  submitting: 'Envoi en cours…',
  submit: 'Envoyer ma demande',
  consentNote:
    "En soumettant ce formulaire vous acceptez de recevoir un email de confirmation à l'adresse renseignée.",
  backToIntroArrow: '← Retour à la présentation',
  errorSlugInvalid: 'Slug invalide : {reason}',
  errorOrgRequired: "Le nom de l'organisation est requis.",
  errorDescTooLong: 'La description ne peut pas dépasser 1000 caractères.',
  cgvBefore: 'J’ai lu et j’accepte les ',
  cgvLink: 'conditions générales de vente',
  cgvAfter: ' (version {version}).',
  errorCgvRequired:
    'Vous devez accepter les conditions générales de vente pour ouvrir un espace.',
  errorCaptcha: "Veuillez compléter le captcha avant d'envoyer.",
  errorSession: 'Session expirée — reconnectez-vous via Discord et réessayez.',
  errorRateLimit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  errorConflict:
    'Une demande active existe déjà — vérifiez vos mails ou contactez le staff.',
  errorBadData: 'Données invalides.',
  errorGeneric: 'Impossible de soumettre la demande pour le moment.',
  toastSuccess: 'Demande envoyée. Vérifiez vos mails pour confirmer.',
  errorNetwork: 'Erreur réseau ou serveur. Réessayez dans quelques instants.',
  prefillPlan: 'Offre visée : {plan}.',
  prefillTermMonth: ' Paiement au mois.',
  prefillTermYear: " Paiement à l'année.",
});
