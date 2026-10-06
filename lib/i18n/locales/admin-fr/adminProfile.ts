// lib/i18n/locales/admin-fr/adminProfile.ts
//
// Traductions FRANCAISES du namespace `adminProfile` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminProfile', {
  pageTitle: 'Admin – Mon profil',
  breadcrumbStaff: 'Espace staff',
  breadcrumbCurrent: 'Mon profil',
  heading: 'Mon profil',
  subtitle: 'Résumé de ton compte staff.',
  avatarAlt: 'Avatar',
  logout: 'Déconnexion',
  tabProfile: 'Profil',
  tabSecurity: 'Sécurité',
  tabPrivacy: 'Confidentialité',
  emailLabel: 'Email',
  roleLabel: 'Rôle staff',
  createdAtLabel: 'Profil créé le',
  staffIdLabel: 'ID staff',
  editHeading: 'Modifier mon profil',
  displayNameLabel: 'Nom affiché',
  displayNamePlaceholder: 'Ton pseudo staff',
  avatarUrlLabel: 'Avatar (URL)',
  avatarHelp: "Optionnel. Laisse vide pour retirer l'avatar.",
  saving: 'Enregistrement…',
  save: 'Enregistrer',
  emailHeading: 'Changer mon email',
  newEmailLabel: 'Nouvel email',
  emailSending: 'Envoi en cours…',
  emailSubmit: 'Changer mon email',
  emailConfirmNote:
    'Un email de confirmation sera envoyé à ta nouvelle adresse.',
  passwordHeading: 'Changer mon mot de passe',
  newPasswordLabel: 'Nouveau mot de passe',
  confirmPasswordLabel: 'Confirmer le mot de passe',
  passwordChanging: 'Modification…',
  passwordSubmit: 'Changer mon mot de passe',
  passwordHelp: 'Minimum 8 caractères.',
  dataHeading: 'Mes données',
  exporting: 'Export en cours…',
  exportBtn: 'Télécharger mes données',
  exportHelp:
    "Récupère toutes tes informations personnelles au format JSON (droit d'accès RGPD).",
  deleteBtn: 'Supprimer mon compte',
  deleteHelp:
    "Droit à l'oubli RGPD — ton compte et toutes tes données seront supprimés définitivement.",
  systemHeading: 'Informations système',
  userIdLabel: 'ID utilisateur',
  deleteDialogTitle: 'Supprimer mon compte',
  deleteDialogSubtitle: "Droit à l'oubli RGPD",
  deleteConfirmLabel: 'Confirmer la suppression',
  deleteConfirmingLabel: 'Suppression…',
  cancelLabel: 'Annuler',
  deleteDialogBodyBefore: 'Cette action est ',
  deleteDialogBodyStrong: 'irréversible',
  deleteDialogBodyAfter:
    '. Toutes tes données, ton rôle staff et tes appartenances seront définitivement supprimés.',
  defaultDisplayName: 'Profil staff',
  toastEmailSent:
    'Un email de confirmation a été envoyé à ta nouvelle adresse. Clique sur le lien pour finaliser le changement.',
  errorEmailChange: "Erreur lors du changement d'email.",
  errorPasswordTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  errorPasswordMismatch: 'Les mots de passe ne correspondent pas.',
  toastPasswordChanged: 'Ton mot de passe a été modifié avec succès.',
  errorPasswordChange: 'Erreur lors du changement de mot de passe.',
  toastProfileUpdated: 'Profil mis à jour.',
  errorExport: "Erreur lors de l'export.",
  errorDelete: 'Erreur lors de la suppression.',
  errorUnexpected: 'Erreur inattendue',
  battlenetHeading: 'Vérifier mon BattleTag',
  twitchHeading: 'Mon compte Twitch',
  discordHeading: 'Mon compte Discord',
  tcgHeading: 'Ma carte à collectionner',
  // Double authentification (TOTP) — carte du profil + page /admin/mfa.
  mfaHeading: 'Double authentification (TOTP)',
  mfaIntro:
    'Protège ton compte staff avec un code à 6 chiffres généré par une application d’authentification (Google Authenticator, 1Password, Aegis…).',
  mfaInvite:
    'Recommandé : active la double authentification. Elle pourra devenir obligatoire pour accéder à l’administration.',
  mfaStatusOn: 'Activée',
  mfaStatusOff: 'Non activée',
  mfaEnableBtn: 'Activer la double authentification',
  mfaScanQr:
    'Scanne ce QR code avec ton application, puis saisis le code qu’elle affiche.',
  mfaQrAlt: 'QR code d’enrôlement TOTP',
  mfaSecretLabel: 'Ou saisis cette clé manuellement',
  mfaCodeLabel: 'Code à 6 chiffres',
  mfaVerifyBtn: 'Vérifier et activer',
  mfaVerifying: 'Vérification…',
  mfaCancelBtn: 'Annuler',
  mfaChallengeIntro:
    'Saisis le code de ton application d’authentification pour valider cette session.',
  mfaChallengeBtn: 'Valider',
  mfaSessionVerified: 'Cette session est validée par ton second facteur.',
  mfaDisableBtn: 'Désactiver',
  mfaDisableHelp:
    'Désactiver la double authentification exige une session validée par un code.',
  toastMfaEnabled: 'Double authentification activée.',
  toastMfaVerified: 'Session validée.',
  toastMfaDisabled: 'Double authentification désactivée.',
  errorMfaCode: 'Code invalide. Réessaie avec le code affiché en ce moment.',
  errorMfaGeneric: 'Erreur de double authentification.',
  mfaPageTitle: "Double authentification | OW Women's Cup",
  mfaPageBadge: 'Sécurité',
  mfaPageHeading: 'Double authentification',
  mfaPageEnforcedIntro:
    'L’accès à l’administration exige un second facteur. Active-le ou valide ton code pour continuer.',
  mfaPageOptionalIntro:
    'Le second facteur n’est pas encore obligatoire, mais il protège ton compte dès aujourd’hui.',
  mfaPageContinue: 'Continuer vers l’administration',
  mfaPageLogout: 'Se déconnecter',
});
