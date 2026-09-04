// lib/i18n/locales/fr/developerRegisterPage.ts
//
// Traductions FRANCAISES du namespace `developerRegisterPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('developerRegisterPage', {
  badgeRole: 'Développeur',
  badgeAction: 'Compte self-service',
  title: 'Créer un compte développeur',
  subtitle:
    "Accès self-service à l'API publique : génère tes clés, abonne-toi aux webhooks et suis ta consommation.",
  // Le prix vient du barème, jamais recopié : une grille tarifaire qui se
  // contredit d'une page à l'autre est pire que pas de prix du tout.
  planNoticeTitle: '{days} jours d’essai, puis {price} €/mois',
  planNoticeBody:
    "L'API est incluse à partir du plan {plan}. Ton espace démarre sur un essai complet de {days} jours, sans carte bancaire. À l'échéance il retombe sur {fallback} : les clés restent, mais les appels sont refusés tant que l'abonnement n'est pas pris.",
  orgNameLabel: "Nom de l'organisation / du projet",
  orgNamePlaceholder: 'Mon studio, mon app…',
  emailLabel: 'Email',
  emailPlaceholder: 'toi@exemple.com',
  passwordLabel: 'Mot de passe',
  passwordHint: '8 caractères minimum.',
  submit: 'Créer mon compte',
  submitLoading: 'Création en cours…',
  captchaMissing:
    'Vérification anti-robot indisponible (clé Turnstile non configurée). Réessaie plus tard.',
  errorPasswordTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  errorOrgRequired: 'Renseigne le nom de ton organisation ou de ton projet.',
  errorEmailRequired: 'Renseigne une adresse email.',
  errorCaptcha: 'Merci de valider la vérification anti-robot.',
  errorRateLimited:
    'Trop de tentatives. Patiente quelques instants avant de réessayer.',
  errorGeneric: 'La création du compte a échoué. Réessaie dans un instant.',
  errorNetwork: 'Une erreur réseau est survenue. Vérifie ta connexion.',
  alreadyExists: 'Un compte existe déjà avec cet email.',
  signinFailed:
    'Ton compte a bien été créé. Connecte-toi avec ton email et ton mot de passe.',
  linkLogin: 'Se connecter',
  linkBackToDocs: "Voir la documentation de l'API",
});
