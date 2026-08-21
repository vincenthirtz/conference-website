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
  errInvalidEmail: 'Adresse email invalide',
  errEmailExists:
    'Un compte existe déjà avec cette adresse email. Cherchez-le dans la gestion des utilisateurs plutôt que d’en créer un second.',
  errWeakPassword:
    'Le mot de passe doit faire au moins {min} caractères (ou laissez le champ vide pour en générer un).',
  errInvalidRole: 'Rôle inconnu',
  errRoleForbidden:
    'Vous ne pouvez pas créer un compte dont le rôle est supérieur ou égal au vôtre.',
  errLoadTeams: 'Impossible de charger la liste des équipes.',
  errResend: 'Impossible de renvoyer les identifiants',
  retry: 'Réessayer',
  errTeamAssign:
    "Utilisateur créé mais erreur lors de l'ajout à l'équipe: {error}",
  toastCreated: 'Compte créé avec succès',
  errUnexpected: 'Erreur inattendue',
  successTitle: 'Compte créé avec succès',
  userIdLabel: 'User ID :',
  emailLabel: 'Email :',
  passwordSentByEmail:
    "Le mot de passe a été envoyé par email à l'utilisateur.",
  resendCredentials: 'Renvoyer les identifiants',
  resending: 'Envoi…',
  toastCredentialsSent: 'Identifiants renvoyés par email',
  staffAccessGranted: 'Accès back-office accordé (rôle {role}).',
  staffRoleWarning:
    'Ce rôle donne accès au back-office : un compte staff « {role} » sera créé.',
  openUserSpace: 'Ouvrir la fiche du compte',
  openTeam: "Voir l'équipe",
  emailNotSent:
    "L'email de bienvenue n'a pas pu être envoyé : personne ne connaît le mot de passe de ce compte. Relancez l'envoi (le mot de passe sera régénéré).",
  teamAssignedTitle: "Ajouté à l'équipe",
  teamLabel: 'Équipe :',
  roleLabelColon: 'Rôle :',
  setCaptainSuccess: 'Défini comme capitaine',
  createAnother: 'Créer un autre utilisateur',
  sectionLogin: 'Informations de connexion',
  emailField: 'Email',
  passwordField: 'Mot de passe',
  passwordPlaceholder: 'Laisser vide pour générer',
  passwordHelp:
    'Vide = mot de passe auto-généré ({min} caractères minimum sinon)',
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
  infoStaffRole:
    'Un rôle Caster / Admin / Owner crée aussi le compte staff correspondant',
  teamAttachTitle: 'Rattachement équipe',
  teamInfoBattleTag: 'Le BattleTag doit être au format Pseudo#0000',
  teamInfoAddedMembers: "L'utilisateur sera ajouté à team_members",
  teamInfoCaptain: 'Si capitaine, teams.captain_id sera mis à jour',
});
