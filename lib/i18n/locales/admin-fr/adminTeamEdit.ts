// lib/i18n/locales/admin-fr/adminTeamEdit.ts
//
// Traductions FRANCAISES du namespace `adminTeamEdit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamEdit', {
  errUnexpected: 'Erreur inattendue',
  toastTeamUpdated: 'Équipe mise à jour',
  errRegister: "Échec de l'inscription",
  confirmUnregister: 'Désinscrire cette équipe de ce tournoi ?',
  errEmailOrUserId: 'Email ou User ID requis',
  errBattleTagRequired: 'BattleTag est obligatoire',
  errAddMember: "Impossible d'ajouter le membre",
  toastMemberAdded: 'Membre ajouté',
  toastMemberEdited: 'Membre modifié',
  confirmDeleteMember: "Retirer {member} de l'équipe ?",
  toastMemberRemoved: 'Membre retiré',
  confirmSetCaptain: 'Définir {member} comme capitaine ?',
  toastCaptainSet: 'Capitaine défini',
  toastSwapDone: 'Échange effectué',
  bulkPartial: '{success} appliqué(s), {failure} ignoré(s)',
  bulkSuccess: '{success} membre(s) mis à jour',
  confirmBulkRemove:
    "Retirer {count} membre(s) de l'équipe ? Le capitaine est protégé et ne sera pas retiré.",
  errNoValidImport: 'Aucune ligne valide à importer',
  importPartial: '{success} BattleTag(s) importé(s), {failure} échoué(s)',
  importSuccess: '{success} BattleTag(s) importé(s)',
  headTitle: 'Admin – Éditer équipe',
  headTitleWithName: 'Admin – Éditer équipe : {name}',
  breadcrumbTeams: 'Équipes',
  breadcrumbTeam: 'Équipe',
  breadcrumbEdit: 'Modifier',
  backToList: 'Retour à la liste',
  loading: 'Chargement...',
  active: 'Active',
  inactive: 'Inactive',
  generalInfo: 'Informations générales',
  nameLabel: 'Nom *',
  namePlaceholder: "Nom de l'équipe",
  shortNameLabel: 'Tag / Short name',
  logoLabel: 'Logo',
  bannerLabel: 'URL Bannière',
  countryLabel: 'Pays',
  teamActive: 'Équipe active',
  descriptionLabel: 'Description',
  descriptionPlaceholder: "Présentation de l'équipe",
  twitterLabel: 'Twitter',
  discordLabel: 'Discord',
  discordRoleIdLabel: 'ID rôle Discord',
  discordRoleIdHelp:
    'Pingé automatiquement lors des annonces de match (J-15min, résultats).',
  websiteLabel: 'Site web',
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  tournamentsTitle: 'Tournois',
  registeredTitle: 'Inscrits ({count})',
  noRegistration: 'Aucune inscription',
  unregister: 'Désinscrire',
  registerToTournament: 'Inscrire à un tournoi',
  selectTournament: 'Sélectionner un tournoi...',
  register: 'Inscrire',
  systemInfoTitle: 'Informations système',
  teamIdLabel: "ID de l'équipe",
  quickLinksTitle: 'Liens rapides',
  publicPage: 'Page publique',
});
