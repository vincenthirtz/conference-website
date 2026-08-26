// lib/i18n/locales/admin-fr/adminResetPassword.ts
//
// Traductions FRANCAISES du namespace `adminResetPassword` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminResetPassword', {
  pageTitle: "Nouveau mot de passe | OW Women's Cup",
  badgeStaff: 'Staff',
  badgeAction: 'Reset',
  heading: 'Nouveau mot de passe',
  intro:
    'Saisis ton nouveau mot de passe après avoir ouvert le lien reçu par email.',
  loadingSession: 'Chargement de la session…',
  invalidLinkDefault: 'Lien invalide, expiré ou déjà utilisé.',
  singleUseNote:
    "Les liens de réinitialisation sont à usage unique : ne les ouvre qu'une seule fois. Demande un nouveau lien ci-dessous.",
  requestNewLink: 'Redemander un lien',
  newPasswordLabel: 'Nouveau mot de passe',
  confirmLabel: 'Confirmation',
  submitUpdating: 'Mise à jour...',
  submit: 'Mettre à jour',
  backToLogin: 'Retour à la connexion',
  errorCodeInvalid: 'Lien de récupération invalide ou déjà utilisé.',
  errorRestoreSession: 'Impossible de restaurer la session de récupération.',
  errorNoSession:
    'Lien invalide, expiré ou déjà utilisé. Redemande un nouveau lien de réinitialisation.',
  errorLinkExpiredSubmit:
    'Lien expiré ou déjà utilisé. Redemande un nouveau lien de réinitialisation.',
  errorPasswordTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  errorPasswordMismatch: 'Les mots de passe ne correspondent pas.',
  errorUpdateFailed: 'Impossible de mettre à jour le mot de passe.',
  successUpdated: 'Mot de passe mis à jour. Tu peux te reconnecter.',
  errorUnexpected: 'Erreur inattendue',
});
