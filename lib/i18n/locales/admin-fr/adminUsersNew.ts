// lib/i18n/locales/admin-fr/adminUsersNew.ts
//
// Traductions FRANCAISES du namespace `adminUsersNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminUsersNew', {
  roleOwner: 'Owner',
  roleAdmin: 'Admin',
  roleManager: 'Manager',
  roleCaster: 'Caster',
  rolePlayer: 'Joueur',
  roleMember: 'Membre',
  headTitle: 'Admin – Créer un utilisateur',
  heading: 'Nouvel utilisateur',
  subtitle: "Créer un compte et optionnellement l'ajouter à une équipe",
  backToList: 'Retour à la liste',
  errSelectTeam: 'Veuillez sélectionner une équipe',
  errBattleTagRequired: 'BattleTag requis (format Pseudo#0000)',
  errBattleTagInvalid: 'Format BattleTag invalide (ex: Pseudo#1234)',
  errCreateUser: "Impossible de créer l'utilisateur",
  errTeamAssign:
    "Utilisateur créé mais erreur lors de l'ajout à l'équipe: {error}",
  toastCreated: 'Compte créé avec succès',
  errUnexpected: 'Erreur inattendue',
  successTitle: 'Compte créé avec succès',
  userIdLabel: 'User ID :',
  emailLabel: 'Email :',
  passwordSentByEmail:
    "Le mot de passe a été envoyé par email à l'utilisateur.",
  emailNotSent:
    "L'email de bienvenue n'a pas pu être envoyé. Utilisez « Renvoyer les identifiants » depuis la gestion des utilisateurs.",
  teamAssignedTitle: "Ajouté à l'équipe",
  teamLabel: 'Équipe :',
  roleLabelColon: 'Rôle :',
  setCaptainSuccess: 'Défini comme capitaine',
  createAnother: 'Créer un autre utilisateur',
  sectionLogin: 'Informations de connexion',
  emailField: 'Email',
  passwordField: 'Mot de passe',
  passwordPlaceholder: 'Laisser vide pour générer',
  passwordHelp: 'Vide = mot de passe auto-généré',
  sectionProfil: 'Profil',
  displayNameField: 'Nom affiché',
  displayNamePlaceholder: 'Pseudo du joueur',
  systemRoleField: 'Rôle système',
  sectionAttachTeam: 'Rattacher à une équipe',
  enable: 'Activer',
  teamField: 'Équipe',
  selectTeam: 'Sélectionner une équipe',
  loadingTeams: 'Chargement des équipes...',
  battleTagField: 'BattleTag',
  battleTagPlaceholder: 'Pseudo#1234',
  battleTagHelp: 'Format: Pseudo#0000',
  teamRoleField: "Rôle dans l'équipe",
  setCaptain: 'Définir comme capitaine',
  cancel: 'Annuler',
  creating: 'Création...',
  submit: "Créer l'utilisateur",
  infoTitle: 'Informations',
  infoServiceRole: 'Le compte est créé via le service role Supabase',
  infoEmailConfirmed: "L'email est automatiquement marqué comme confirmé",
  infoPasswordGenerated: 'Le mot de passe est généré si laissé vide',
  teamAttachTitle: 'Rattachement équipe',
  teamInfoBattleTag: 'Le BattleTag doit être au format Pseudo#0000',
  teamInfoAddedMembers: "L'utilisateur sera ajouté à team_members",
  teamInfoCaptain: 'Si capitaine, teams.captain_id sera mis à jour',
});
