// lib/i18n/locales/fr/playerProfile.ts
//
// Traductions FRANCAISES du namespace `playerProfile` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerProfile', {
  defaultName: 'Joueuse',
  profileUpdated: 'Profil mis a jour.',
  genericError: 'Erreur',
  emailConfirmSent:
    'Un email de confirmation a été envoyé à ta nouvelle adresse. Clique sur le lien pour finaliser le changement.',
  emailChangeError: "Erreur lors du changement d'email.",
  passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  passwordMismatch: 'Les mots de passe ne correspondent pas.',
  passwordChanged: 'Ton mot de passe a été modifié avec succès.',
  passwordChangeError: 'Erreur lors du changement de mot de passe.',
  exportError: 'Erreur lors de l’export.',
  deleteError: 'Erreur lors de la suppression.',
  avatarAlt: 'Avatar',
  signedOutTitle: 'Mon profil',
  signedOutText: 'Connecte-toi pour accéder à ton profil joueur.',
  signIn: 'Se connecter',
  roleCaptain: 'Capitaine',
  rolePlayer: 'Joueuse',
  backToDashboard: 'Tableau de bord',
  pageTitle: 'Mon profil',
  pageSubtitle: 'Gère ton compte, ton email, ton mot de passe et tes données.',
  email: 'Email',
  battleTag: 'BattleTag',
  createdOn: 'Compte créé le',
  userId: 'ID utilisateur',
  editProfile: 'Modifier mon profil',
  displayNameLabel: 'Nom affiché',
  displayNamePlaceholder: 'Ton pseudo',
  battleTagPlaceholder: 'Pseudo#1234',
  setupBattleTagTitle: 'Il te manque ton BattleTag',
  setupBattleTagBody:
    "Ton compte Discord est lié. Renseigne maintenant ton BattleTag : c'est lui qui t'identifie sur le roster de ton équipe et en jeu.",
  avatarLabel: 'Avatar (URL)',
  avatarPlaceholder: 'https://…',
  avatarHelp: "Laisse vide pour retirer l'avatar.",
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  changeEmail: 'Changer mon email',
  newEmailLabel: 'Nouvel email',
  newEmailPlaceholder: 'nouveau@email.com',
  sending: 'Envoi en cours...',
  changeEmailBtn: 'Changer mon email',
  emailHelp: 'Un email de confirmation sera envoyé à la nouvelle adresse.',
  changePassword: 'Changer mon mot de passe',
  newPasswordLabel: 'Nouveau mot de passe',
  confirmPasswordLabel: 'Confirmer le mot de passe',
  updatingPassword: 'Modification...',
  changePasswordBtn: 'Changer mon mot de passe',
  passwordHelp: 'Minimum 8 caractères.',
  myData: 'Mes données',
  exporting: 'Export en cours...',
  downloadData: 'Télécharger mes données',
  exportConfirmText:
    'contenant toutes tes informations personnelles (compte, équipes, demandes) sera téléchargé.',
  aFile: 'Un fichier',
  confirmDownload: 'Confirmer le téléchargement',
  cancel: 'Annuler',
  dataHelp:
    "Récupère toutes tes informations personnelles au format JSON (droit d'accès RGPD).",
  deleteAccount: 'Supprimer mon compte',
  deleteWarningStart: 'Cette action est',
  deleteWarningBold: 'irréversible',
  deleteWarningEnd:
    '. Toutes tes données, ton appartenance à une équipe et tes demandes seront définitivement supprimées.',
  deleting: 'Suppression...',
  confirmDelete: 'Confirmer la suppression',
  deleteHelp:
    "Droit à l'oubli RGPD — ton compte et toutes tes données seront supprimés définitivement.",
  currentPasswordLabel: 'Mot de passe actuel',
  currentPasswordPlaceholder: 'Ton mot de passe actuel',
  wrongCurrentPassword: 'Mot de passe actuel incorrect.',
  currentPasswordRequired: 'Saisis ton mot de passe actuel pour confirmer.',
  reauthHelp:
    'Pour ta sécurité, confirme ton mot de passe actuel avant de modifier ton compte.',
  signedOutAfterPasswordChange:
    'Mot de passe modifié. Par sécurité, toutes tes sessions ont été déconnectées. Reconnecte-toi avec ton nouveau mot de passe.',
  battlenetTitle: 'Vérifier mon BattleTag',
  battlenetWhy:
    'Relie ton compte Battle.net pour prouver que ce BattleTag est bien le tien. Ton équipe gagne un badge de confiance sur le roster, et ça protège la compétition contre les smurfs.',
  battlenetVerifyBtn: 'Vérifier mon compte Battle.net',
  battlenetVerifiedTitle: 'Compte Battle.net vérifié',
  battlenetVerifiedProof:
    "Ce BattleTag t'appartient réellement : preuve anti-usurpation et anti-smurf.",
  battlenetVerifiedOn: 'Vérifié le {date}',
  battlenetToastVerified: 'Ton BattleTag est vérifié ✅',
  battlenetToastNoMatch:
    'Compte Battle.net lié, mais il ne correspond à aucun BattleTag de tes rosters. Vérifie que le tag saisi dans ton équipe correspond bien à ce compte.',
  battlenetToastAlreadyLinked:
    'Ce compte Battle.net est déjà lié à une autre joueuse.',
  battlenetToastError: 'La vérification a échoué, réessaie.',
  roleManager: 'Manager',
  roleCoach: 'Coach',
  roleSubstitute: 'Remplaçante',
});
