// lib/i18n/locales/admin-fr/adminLibraryAccess.ts
//
// Traductions FRANCAISES du namespace `adminLibraryAccess` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.
//
// Panneau « Accès à la Library » de l'onglet Library du hub /admin/moderation
// (lot 14c de docs/PLAN-womens-library.md : une bêta par liste). Namespace
// SEPARE : seul ce panneau, charge paresseusement, l'importe.

import { adminNs } from '../../ns';

export default adminNs('adminLibraryAccess', {
  heading: 'Accès à la Library',
  subtitle:
    'Qui entre dans la Women’s Library de cet espace. Un changement vaut sans redéployer, en quelques secondes au plus.',
  loadError: 'Réglage d’accès illisible.',
  effectiveLabel: 'Appliqué en ce moment :',
  envOverride:
    'La variable LIBRARY_ACCESS de l’API impose « {mode} » : ce réglage ne s’applique pas tant qu’elle est posée.',
  invalidSetting:
    'Le réglage enregistré était illisible : la Library est fermée (propriétaire seule) jusqu’au prochain enregistrement.',

  // Modes
  modeLegend: 'Mode d’accès',
  modeOwner: 'Propriétaire seule',
  modeOwnerHelp:
    'La propriétaire de l’association, et personne d’autre. C’est le réglage par défaut.',
  modeStaff: 'Staff',
  modeStaffHelp: 'La propriétaire et les admins de l’espace.',
  modeBeta: 'Bêta fermée',
  modeBetaHelp:
    'Le staff (propriétaire, admins), plus les joueuses de la liste et les membres acceptées des équipes de la liste.',
  modeAll: 'Ouverte à toutes',
  modeAllHelp:
    'Toute joueuse majeure qui a un compte. L’âge, l’attestation et les bannissements s’appliquent toujours.',
  listsInactive:
    'Les listes ci-dessous ne servent qu’en mode « Bêta fermée » : elles sont gardées pour plus tard.',

  // Équipes
  teamsHeading: 'Équipes de la bêta',
  teamsEmpty: 'Aucune équipe pour l’instant.',
  teamMembersOne: '1 membre acceptée',
  teamMembersMany: '{count} membres acceptées',
  teamMembersLater: 'membres comptées à l’enregistrement',
  teamDeleted: 'Supprimée',
  teamUnknown: 'Équipe introuvable',
  teamRemoveAria: 'Retirer l’équipe {name} de la bêta',
  teamSearchLabel: 'Ajouter une équipe',
  teamSearchHelp:
    'Au moins 2 lettres du nom. Seules les membres ACCEPTÉES de l’équipe entrent : une invitation en attente n’ouvre rien.',
  teamSearchEmpty: 'Aucune équipe ne correspond.',
  teamSearchError: 'Recherche d’équipes impossible.',
  teamSearchResults: 'Équipes trouvées',
  teamAdd: 'Ajouter',
  teamAddAria: 'Ajouter l’équipe {name} à la bêta',
  teamAlreadyListed: 'Déjà dans la liste',

  // Joueuses
  playersHeading: 'Joueuses de la bêta',
  playersEmpty: 'Aucune joueuse pour l’instant.',
  playerNoAvatar: 'pas encore entrée dans la Library',
  playerPending: 'pseudo vérifié à l’enregistrement',
  playerRemoveAria: 'Retirer {name} de la bêta',
  playerAddLabel: 'Ajouter une joueuse',
  playerAddHelp:
    'Son identifiant de compte (UUID complet, 36 caractères), ou son pseudo de la Library si elle y est déjà entrée (3 à 20 caractères).',
  playerAddInvalid:
    'Il faut un identifiant de compte complet (36 caractères) ou un pseudo de 3 à 20 caractères.',
  playerAddDuplicate: 'Elle est déjà dans la liste.',
  playerAdd: 'Ajouter',

  // Enregistrer
  remove: 'Retirer',
  removalNote:
    'Retirer quelqu’un bloque ses requêtes aussitôt. Un compte qui a déjà attesté garde toutefois les canaux temps réel qu’il a rejoints jusqu’au rafraîchissement de sa session : pour écarter quelqu’un tout de suite, bannissez-la (plus bas).',
  unsaved: 'Modifications non enregistrées.',
  save: 'Enregistrer l’accès',
  saving: 'Enregistrement…',
  revert: 'Annuler les modifications',
  saved: 'Accès à la Library enregistré.',
  confirmAllTitle: 'Ouvrir la Women’s Library à toutes ?',
  confirmAllSubtitle:
    'Toute joueuse majeure qui a un compte pourra entrer. La charte est-elle publiée, et la modération organisée ?',
  confirmAllLabel: 'Ouvrir à toutes',

  // Refus
  errorSave: 'Enregistrement impossible.',
  errorConflict:
    'Le réglage a changé entre-temps : la version à jour est affichée, refaites vos changements.',
  errorPlayerNotFound:
    'Aucune joueuse de la Library ne porte ce pseudo : désignez-la par son identifiant de compte.',
  errorTeamNotFound:
    'Une équipe ajoutée n’existe pas dans l’espace, ou vient d’être supprimée.',
  errorTooManyPlayers: 'Trop de joueuses : {max} au plus.',
  errorTooManyTeams: 'Trop d’équipes : {max} au plus.',
});
