// lib/i18n/locales/admin-fr/adminModerationEntityBlacklist.ts
//
// Traductions FRANCAISES du namespace `adminModerationEntityBlacklist` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminModerationEntityBlacklist', {
  heading: 'Blacklist équipes & structures',
  subtitle:
    "Noms d'équipes et de structures/assos bannis pour ce tenant. Une entrée inactive est conservée pour l'historique mais n'est plus appliquée.",
  alertHelp:
    "La blacklist ne bloque jamais : elle alerte le staff à la création d'équipe (nom exactement identique = alerte forte, nom inclus dans le nom soumis = alerte faible). Les alertes arrivent dans le salon staff Discord.",
  addHeading: 'Ajouter une entrée',
  addHelp:
    "Type et nom requis. Le nom est comparé aux créations d'équipes : correspondance exacte = alerte forte, inclusion = alerte faible.",
  typeLabel: 'Type',
  typeTeam: 'Équipe',
  typeOrg: 'Structure',
  nameLabel: 'Nom',
  namePlaceholder: "Nom de l'équipe ou de la structure",
  reasonLabel: 'Raison (optionnel)',
  reasonPlaceholder: 'Comportement toxique, triche…',
  notesLabel: 'Notes internes (optionnel)',
  notesPlaceholder: 'Contexte, références…',
  adding: 'Ajout…',
  addToBlacklist: 'Ajouter à la blacklist',
  searchPlaceholder: 'Rechercher un nom…',
  searchBtn: 'Rechercher',
  filterAllTypes: 'Tous les types',
  filterTeams: 'Équipes',
  filterOrgs: 'Structures',
  filterAllStatus: 'Tous statuts',
  filterActive: 'Actifs',
  filterInactive: 'Inactifs',
  refresh: 'Rafraîchir',
  emptyEntries: 'Aucune entrée dans la blacklist.',
  entriesCount_one: '{total} entrée',
  entriesCount_other: '{total} entrées',
  statusActive: 'Actif',
  statusInactive: 'Inactif',
  editNamePlaceholder: 'Nom',
  editReasonPlaceholder: 'Raison',
  editNotesPlaceholder: 'Notes internes',
  savingEdit: 'Enregistrement…',
  saveEdit: 'Enregistrer',
  cancel: 'Annuler',
  bannedBy: 'Banni par : {who}',
  edit: 'Éditer',
  deactivate: 'Lever le ban',
  reactivate: 'Rétablir le ban',
  delete: 'Supprimer',
  errorNameRequired: 'Le nom est requis.',
  entryAdded: 'Entrée ajoutée à la blacklist.',
  entryDeactivated: "Ban levé — l'entrée reste dans l'historique.",
  entryReactivated: 'Ban rétabli.',
  entryUpdated: 'Entrée mise à jour.',
  confirmDeleteTitle: 'Supprimer cette entrée ?',
  confirmDeleteSubtitle:
    '« {label} » sera retiré définitivement de la blacklist.',
  confirmDeleteLabel: 'Supprimer',
  entryDeleted: 'Entrée supprimée.',
  pagePrev: 'Précédent',
  pageNext: 'Suivant',
  pageInfo: '{from}–{to} sur {total}',
});
