// lib/i18n/locales/admin-fr/adminModerationBlacklist.ts
//
// Traductions FRANCAISES du namespace `adminModerationBlacklist` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminModerationBlacklist', {
  pageTitle: 'Admin – Blacklist joueurs',
  heading: 'Blacklist joueurs',
  subtitle:
    "Joueurs bannis pour ce tenant. Une entrée inactive est conservée pour l'historique mais n'est plus appliquée.",
  sourceBotScan: 'Scan du bot',
  sourceBotMemberAdd: 'Arrivée membre',
  sourceRegistration: 'Inscription site',
  addHeading: 'Ajouter une entrée',
  addHelp:
    "Au moins un identifiant requis : BattleTag, pseudo d'affichage ou ID Discord.",
  battleTagLabel: 'BattleTag',
  displayNameLabel: "Pseudo d'affichage",
  discordIdLabel: 'ID Discord',
  displayNamePlaceholder: 'Pseudo',
  reasonLabel: 'Raison (optionnel)',
  reasonPlaceholder: 'Comportement toxique, triche…',
  notesLabel: 'Notes internes (optionnel)',
  notesPlaceholder: 'Contexte, références…',
  adding: 'Ajout…',
  addToBlacklist: 'Ajouter à la blacklist',
  searchPlaceholder: 'Rechercher (BattleTag, pseudo, ID Discord)…',
  searchBtn: 'Rechercher',
  filterAllStatus: 'Tous statuts',
  filterActive: 'Actifs',
  filterInactive: 'Inactifs',
  refresh: 'Rafraîchir',
  emptyEntries: 'Aucune entrée dans la blacklist.',
  entriesCount_one: '{total} entrée',
  entriesCount_other: '{total} entrées',
  statusActive: 'Actif',
  statusInactive: 'Inactif',
  discordLine: 'Discord: {id}',
  editReasonPlaceholder: 'Raison',
  editNotesPlaceholder: 'Notes internes',
  savingEdit: 'Enregistrement…',
  saveEdit: 'Enregistrer',
  cancel: 'Annuler',
  bannedBy: 'Banni par : {who}',
  edit: 'Éditer',
  deactivate: 'Désactiver',
  reactivate: 'Réactiver',
  delete: 'Supprimer',
  historyHeading: 'Historique des détections',
  historySubtitle:
    "Journal des correspondances détectées par le bot (scan, arrivée d'un membre) ou lors d'une inscription sur le site.",
  forceLabel: 'Force',
  forceAll: 'Toutes',
  forceStrong: 'Forte (strong)',
  forceSoft: 'Faible (soft)',
  sourceFilterLabel: 'Source',
  sourceAll: 'Toutes',
  emptyAlerts: 'Aucune détection enregistrée.',
  alertStrong: 'Forte',
  alertSoft: 'Faible',
  criterionLabel: 'Critère :',
  contextLine: 'Contexte : {context}',
  loadMore: 'Charger plus',
  loadingMore: 'Chargement…',
  errorIdentifierRequired:
    'Au moins un identifiant requis (BattleTag, pseudo ou ID Discord).',
  entryAdded: 'Entrée ajoutée à la blacklist.',
  entryDeactivated: 'Entrée désactivée.',
  entryReactivated: 'Entrée réactivée.',
  entryUpdated: 'Entrée mise à jour.',
  confirmDeleteTitle: 'Supprimer cette entrée ?',
  confirmDeleteSubtitle:
    '« {label} » sera retiré définitivement de la blacklist.',
  confirmDeleteLabel: 'Supprimer',
  deleteFallbackLabel: 'cette entrée',
  entryDeleted: 'Entrée supprimée.',
  playerTagPlaceholder: 'Joueur#1234',
});
