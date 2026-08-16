// lib/i18n/locales/admin-fr/adminForgotPassword.ts
//
// Traductions FRANCAISES du namespace `adminForgotPassword` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminForgotPassword', {
  pageTitle: "Réinitialiser le mot de passe | OW Women's Cup",
  badgeStaff: 'Staff',
  badgeAction: 'Réinitialisation',
  heading: 'Mot de passe oublié',
  intro:
    "Entre ton email staff. Nous t'envoyons un lien pour définir un nouveau mot de passe.",
  emailLabel: 'Email',
  emailPlaceholder: 'prenom.nom@organisation.tld',
  submitSending: 'Envoi...',
  submit: 'Envoyer le lien',
  backToLogin: 'Retour à la connexion',
  errorEmailRequired: 'Merci de renseigner ton email.',
  errorSendFailed: "Impossible d'envoyer l'email de réinitialisation.",
  successSent:
    'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
  errorUnexpected: 'Erreur inattendue',
});
