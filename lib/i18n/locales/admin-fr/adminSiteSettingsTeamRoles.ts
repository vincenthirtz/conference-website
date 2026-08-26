// lib/i18n/locales/admin-fr/adminSiteSettingsTeamRoles.ts
//
// Traductions FRANCAISES du namespace `adminSiteSettingsTeamRoles` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminSiteSettingsTeamRoles', {
  pageTitle: "Admin – Rôles d'équipe",
  back: 'Retour aux paramètres du site',
  heading: "Rôles d'équipe",
  subtitle:
    "Configure la liste des rôles proposés dans les formulaires d'équipe (ajout / édition de membre).",
  listHeading: 'Liste des rôles',
  listHelp:
    "L'identifiant est stocké en base. Le libellé est affiché dans les selects.",
  captainLabel: 'Capitaine',
  captainBadge: 'Intégré',
  captainHint:
    "Rôle implicite du créateur de l'équipe — dispose toujours de toutes les permissions et ne peut être ni modifié ni supprimé.",
  captainAllPermissions: 'Toutes les permissions',
  addRole: 'Ajouter un rôle',
  emptyRoles: 'Aucun rôle. Ajoute au moins une entrée.',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  idLabel: 'Identifiant',
  labelLabel: 'Libellé',
  removeRoleTitle: 'Supprimer ce rôle',
  permissionsGranted: 'Permissions accordées par ce rôle',
  recapHeading: 'Récapitulatif des permissions',
  orphan_one: '1 permission n’est accordée par aucun rôle',
  orphan_other: '{count} permissions ne sont accordées par aucun rôle',
  orphanSuffix: '— seul le capitaine pourra effectuer ces actions.',
  noRoleCaptainOnly: 'Aucun rôle — capitaine uniquement',
  saving: 'Sauvegarde...',
  save: 'Sauvegarder',
  cancelChanges: 'Annuler les modifications',
  restoreDefaults: 'Restaurer les valeurs par défaut',
  footerPart1:
    'Les membres existants conservent leur rôle actuel même si tu supprimes ce rôle de la liste — seul le picker des formulaires est affecté. Le lien vers cette page est aussi accessible depuis',
  footerLink: 'Paramètres du site',
  footerSuffix: '.',
  removeConfirmTitle: 'Supprimer ce rôle ?',
  removeConfirmSubtitle:
    'Le rôle "{value}" ne sera plus proposé dans les formulaires. Les membres existants gardent leur rôle actuel.',
  removeConfirmSubtitleGeneric: 'Supprimer cette ligne ?',
  removeConfirmLabel: 'Supprimer',
  restoreConfirmTitle: 'Restaurer la liste par défaut ?',
  restoreConfirmSubtitle:
    'La liste des rôles sera remplacée par les valeurs par défaut (player, coach, sub, manager). Pense à sauvegarder pour persister.',
  restoreConfirmLabel: 'Restaurer',
  errorIdRequired: 'Chaque rôle doit avoir un identifiant.',
  errorIdInvalid:
    'Identifiant invalide "{value}" (lettres minuscules, chiffres, "-" ou "_", max 32).',
  errorIdDuplicate: 'Identifiant en double : "{value}".',
  errorAtLeastOne: 'Au moins un rôle est requis.',
  saveSuccess: 'Rôles sauvegardés',
});
