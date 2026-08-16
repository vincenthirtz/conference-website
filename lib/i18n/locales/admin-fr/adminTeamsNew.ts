// lib/i18n/locales/admin-fr/adminTeamsNew.ts
//
// Traductions FRANCAISES du namespace `adminTeamsNew` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamsNew', {
  headTitle: 'Admin – Nouvelle equipe',
  backToList: 'Retour a la liste des equipes',
  heading: 'Creer une nouvelle equipe',
  subtitle: "Renseigne les informations generales et les membres de l'equipe",
  mainInfoTitle: 'Informations principales',
  nameLabel: "Nom de l'equipe",
  namePlaceholder: 'Ex : Phoenix',
  shortNameLabel: 'Tag / short name',
  shortNamePlaceholder: 'Ex : PNX',
  countryLabel: 'Pays',
  countryPlaceholder: 'Ex : France',
  logoLabel: "Logo de l'équipe",
  descriptionLabel: 'Description',
  descriptionPlaceholder:
    "Quelques infos sur l'equipe, palmares, style de jeu, etc.",
  captainEmailLabel: 'Email du capitaine',
  captainEmailHelp: "L'API convertira cet email en captain_id.",
  membersTitle: "Membres de l'equipe",
  membersSubtitle: 'Ajoute les joueurs / staff avec leur email et un role',
  add: 'Ajouter',
  memberEmailLabel: 'Email (auth.users)',
  roleLabel: 'Role',
  removeMemberTitle: 'Supprimer ce membre',
  membersHelp:
    "L'API creera les lignes dans team_members avec le role et le user_id correspondant a chaque email.",
  summaryTitle: "Resume de l'equipe",
  summaryName: 'Nom',
  summaryTag: 'Tag',
  summaryCountry: 'Pays',
  summaryCaptain: 'Capitaine',
  summaryMembers: 'Membres',
  summaryHelp:
    "Tu pourras editer l'equipe et ses membres plus tard via l'interface admin.",
  actionsTitle: 'Actions',
  actionsHint: 'Verifie bien les emails (ils doivent exister dans auth.users).',
  creating: 'Creation en cours...',
  submit: "Creer l'equipe",
  cancel: 'Annuler',
  toastCreated: 'Equipe creee avec succes',
  errUnexpected: 'Erreur inattendue',
  emailExamplePlaceholder: 'joueur@exemple.com',
});
