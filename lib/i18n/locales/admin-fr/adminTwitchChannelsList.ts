// lib/i18n/locales/admin-fr/adminTwitchChannelsList.ts
//
// Traductions FRANCAISES du namespace `adminTwitchChannelsList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTwitchChannelsList', {
  pageTitle: 'Admin – Chaînes Twitch',
  heading: 'Chaînes Twitch partenaires',
  count_one: '{count} chaîne configurée',
  count_other: '{count} chaînes configurées',
  addButton: 'Ajouter une chaîne',
  searchLabel: 'Recherche',
  searchPlaceholder: 'Nom, chaîne ou badge...',
  emptyFiltered: 'Aucune chaîne trouvée',
  emptyState: 'Aucune chaîne configurée',
  savingOrder: "Sauvegarde de l'ordre…",
  statusActive: 'Actif',
  statusInactive: 'Inactif',
  order: 'Ordre',
  deactivate: 'Désactiver',
  activate: 'Activer',
  edit: 'Modifier',
  delete: 'Supprimer',
  deleteConfirmTitle: 'Supprimer cette chaîne ?',
  errorReorder: "Erreur lors de la sauvegarde de l'ordre.",
  errorDelete: 'Erreur de suppression.',
  errorUpdate: 'Erreur de modification.',
});
